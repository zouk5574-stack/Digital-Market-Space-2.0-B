// controllers/fileController.js (MISE À JOUR)

import { supabase } from "../server.js";
import { v4 as uuidv4 } from "uuid";
import mime from "mime-types";

// Configs (via env - utilisées si .env est chargé avant ce fichier)
const BUCKET = process.env.SUPABASE_FILES_BUCKET || "product-files";
const MAX_FILE_BYTES = Number(process.env.MAX_FILE_BYTES || 50 * 1024 * 1024); // 50 MB
const ALLOWED_MIMES = (process.env.ALLOWED_MIMES || "image/jpeg,image/png,image/webp,video/mp4,application/pdf,application/zip").split(",");

// -----------------------------
// 1. Upload file (seller or admin)
// (Pas de changement)
// -----------------------------
export async function uploadFile(req, res) {
  try {
    const userId = req.user.db.id; 
    const { product_id } = req.body;

    if (!product_id) return res.status(400).json({ error: "product_id requis" });
    if (!req.file) return res.status(400).json({ error: "Fichier requis (multipart/form-data, champ 'file')" });

    const { originalname, mimetype, size, buffer } = req.file;

    // Validation mime & size
    if (!ALLOWED_MIMES.includes(mimetype)) {
      return res.status(400).json({ error: "Type de fichier non autorisé" });
    }
    if (size > MAX_FILE_BYTES) {
      return res.status(400).json({ error: `Fichier trop volumineux (max ${MAX_FILE_BYTES} bytes)` });
    }

    // Verify product exists and ownership
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, user_id")
      .eq("id", product_id)
      .limit(1)
      .single();

    if (productError || !product) return res.status(404).json({ error: "Produit introuvable" });

    if (product.user_id !== userId && !req.user.db.is_super_admin) { 
      return res.status(403).json({ error: "Accès refusé : vous n'êtes pas le propriétaire du produit" });
    }

    // Build storage path
    const ext = mime.extension(mimetype) || originalname.split(".").pop();
    const generatedName = `${uuidv4()}.${ext}`;
    const storagePath = `${userId}/${product_id}/${generatedName}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType: mimetype,
        upsert: false
      });

    if (uploadError) {
      console.error("Supabase storage upload error:", uploadError);
      return res.status(500).json({ error: "Erreur stockage fichier", details: uploadError.message || uploadError });
    }

    // Insert metadata
    const { data: meta, error: metaErr } = await supabase
      .from("product_files")
      .insert([{
        product_id,
        owner_id: userId, 
        storage_path: storagePath,
        filename: originalname,
        content_type: mimetype,
        size_bytes: size,
        is_public: false
      }])
      .select()
      .single();

    if (metaErr) {
      // rollback storage (best effort)
      await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
      console.error("Error inserting file metadata:", metaErr);
      return res.status(500).json({ error: "Erreur enregistrement metadata", details: metaErr.message || metaErr });
    }

    return res.status(201).json({ message: "Fichier uploadé ✅", file: meta });
  } catch (err) {
    console.error("uploadFile error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message || err });
  }
}

// -------------------------------------------------------
// 2. Get signed download URL (buyer/seller/admin authorization)
// -------------------------------------------------------
export async function getFileDownloadUrl(req, res) {
  try {
    const requesterId = req.user?.db.id;
    const { id } = req.params; // product_files.id

    // Fetch metadata
    const { data: file, error: fileErr } = await supabase
      .from("product_files")
      .select("id, product_id, owner_id, storage_path, filename, is_public, created_at")
      .eq("id", id)
      .limit(1)
      .single();

    if (fileErr || !file) return res.status(404).json({ error: "Fichier introuvable" });

    // Public -> short signed url (60s)
    if (file.is_public) {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(file.storage_path, 60); 
      return res.json({ url: data?.signedURL, filename: file.filename });
    }

    // Authorization checks
    const isOwner = requesterId && requesterId === file.owner_id;
    const isAdmin = req.user?.db.is_super_admin; 

    let buyerHasAccess = false;
    if (requesterId && !isOwner && !isAdmin) {
      // Check orders: buyer purchased this product and status allows download
      const { data: orders, error: ordersErr } = await supabase
        .from("orders")
        .select("id,status,buyer_id,product_id")
        .eq("product_id", file.product_id)
        .eq("buyer_id", requesterId);

      if (!ordersErr && orders && orders.length > 0) {
        const allowedStatuses = ["completed", "delivered"]; 
        buyerHasAccess = orders.some(o => allowedStatuses.includes(o.status));
      }
    }

    if (!(isOwner || isAdmin || buyerHasAccess)) {
      return res.status(403).json({ error: "Accès refusé au téléchargement (Achat non confirmé)." });
    }

    // ⭐ CRITIQUE : Création de l'URL signée (TTL 1h30min par défaut)
    const ONE_HOUR_THIRTY_MINUTES_IN_SECONDS = 5400; // 3600 + 1800
    const ttlSeconds = Number(process.env.DOWNLOAD_URL_TTL_SEC || ONE_HOUR_THIRTY_MINUTES_IN_SECONDS); 
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(file.storage_path, ttlSeconds);

    if (error || !data) {
      console.error("createSignedUrl error:", error);
      return res.status(500).json({ error: "Impossible de générer l'URL de téléchargement" });
    }

    return res.json({ url: data.signedURL, filename: file.filename, expires_in: ttlSeconds });
  } catch (err) {
    console.error("getFileDownloadUrl error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message || err });
  }
}

// ---------------------------
// 3. Delete file (owner or admin)
// (Pas de changement)
// ---------------------------
export async function deleteFile(req, res) {
  try {
    const userId = req.user.db.id;
    const { id } = req.params;

    const { data: file, error: fileErr } = await supabase
      .from("product_files")
      .select("id, owner_id, storage_path")
      .eq("id", id)
      .limit(1)
      .single();

    if (fileErr || !file) return res.status(404).json({ error: "Fichier introuvable" });

    if (file.owner_id !== userId && !req.user.db.is_super_admin) {
      return res.status(403).json({ error: "Accès refusé à la suppression" });
    }

    // Delete from storage (best-effort)
    const { error: delErr } = await supabase.storage.from(BUCKET).remove([file.storage_path]);
    if (delErr) {
      console.error("Supabase storage delete error:", delErr);
      // continue to delete metadata anyway
    }

    // Delete metadata
    const { error: metaDelErr } = await supabase.from("product_files").delete().eq("id", id);
    if (metaDelErr) {
      console.error("Error deleting file metadata:", metaDelErr);
      return res.status(500).json({ error: "Erreur suppression metadata", details: metaDelErr.message || metaDelErr });
    }

    return res.json({ message: "Fichier supprimé 🗑️" });
  } catch (err) {
    console.error("deleteFile error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message || err });
  }
}

// ---------------------------------
// 4. List files for a product (owner)
// (Pas de changement)
// ---------------------------------
export async function listFilesForProduct(req, res) {
  try {
    const userId = req.user.db.id;
    const { productId } = req.params;

    // Verify product exists and ownership (or admin)
    const { data: product, error: productErr } = await supabase
      .from("products")
      .select("id, user_id")
      .eq("id", productId)
      .limit(1)
      .single();

    if (productErr || !product) return res.status(404).json({ error: "Produit introuvable" });
    
    if (product.user_id !== userId && !req.user.db.is_super_admin) {
      return res.status(403).json({ error: "Accès refusé à la liste des fichiers" });
    }

    const { data, error } = await supabase
      .from("product_files")
      .select("id, filename, content_type, size_bytes, created_at, is_public")
      .eq("product_id", productId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return res.json({ files: data });
  } catch (err) {
    console.error("listFilesForProduct error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message || err });
  }
}
