// controllers/fileController.js
import { supabase } from "../server.js";
import { v4 as uuidv4 } from "uuid";
import mime from "mime-types";

// Configs
const BUCKET = process.env.SUPABASE_FILES_BUCKET || "product-files";
const MAX_FILE_BYTES = Number(process.env.MAX_FILE_BYTES || 50 * 1024 * 1024); // 50 MB default
const ALLOWED_MIMES = (process.env.ALLOWED_MIMES || "image/jpeg,image/png,image/webp,video/mp4,application/pdf,application/zip").split(",");

// Seller uploads a file for a product
export async function uploadFile(req, res) {
  try {
    const userId = req.user.sub; // seller
    const { product_id } = req.body;
    if (!product_id) return res.status(400).json({ error: "product_id requis" });
    if (!req.file) return res.status(400).json({ error: "Fichier requis" });

    // Validate file
    const { originalname, mimetype, size, buffer } = req.file;
    if (!ALLOWED_MIMES.includes(mimetype)) {
      return res.status(400).json({ error: "Type de fichier non autorisé" });
    }
    if (size > MAX_FILE_BYTES) {
      return res.status(400).json({ error: "Fichier trop volumineux" });
    }

    // Verify the product belongs to the seller (or admin)
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, user_id")
      .eq("id", product_id)
      .single();

    if (productError || !product) return res.status(404).json({ error: "Produit introuvable" });
    if (product.user_id !== userId && !req.user.is_super_admin) {
      return res.status(403).json({ error: "Accès refusé : produit non détenu" });
    }

    // Build storage path
    const ext = mime.extension(mimetype) || originalname.split(".").pop();
    const filename = `${uuidv4()}.${ext}`;
    const storagePath = `${userId}/${product_id}/${filename}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType: mimetype,
        upsert: false,
      });

    if (uploadError) {
      console.error("Supabase storage upload error:", uploadError);
      return res.status(500).json({ error: "Erreur stockage fichier", details: uploadError.message || uploadError });
    }

    // Store metadata in product_files
    const { data: fileMeta, error: metaError } = await supabase
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

    if (metaError) {
      // best-effort rollback: delete storage object
      await supabase.storage.from(BUCKET).remove([storagePath]).catch(()=>{});
      return res.status(500).json({ error: "Erreur enregistrement metadata", details: metaError.message || metaError });
    }

    return res.status(201).json({ message: "Fichier uploadé", file: fileMeta });
  } catch (err) {
    console.error("uploadFile error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message || err });
  }
}

// Generate signed URL for downloading a file (only authorized actors)
export async function getFileDownloadUrl(req, res) {
  try {
    const userId = req.user?.sub; // may be buyer/seller/admin
    const { id } = req.params; // product_files.id

    // Fetch metadata
    const { data: file, error: fileError } = await supabase
      .from("product_files")
      .select("id, product_id, owner_id, storage_path, filename, is_public, created_at")
      .eq("id", id)
      .single();

    if (fileError || !file) return res.status(404).json({ error: "Fichier introuvable" });

    // If public we allow direct signed url for short time
    if (file.is_public) {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(file.storage_path, 60); // 60s
      return res.json({ url: data?.signedURL });
    }

    // Authorization: seller owner or admin OR buyer who purchased the product
    const isOwner = (userId && userId === file.owner_id);
    const isAdmin = req.user?.is_super_admin;

    let isBuyerWithAccess = false;
    if (userId && !isOwner && !isAdmin) {
      // Check if user has an order for this product with status allowing download
      const { data: orders } = await supabase
        .from("orders")
        .select("id,status,buyer_id,product_id")
        .eq("product_id", file.product_id)
        .eq("buyer_id", userId);

      // allow if any order is in accepted statuses
      const allowedStatuses = ["paid", "delivered", "completed"];
      if (orders && orders.length > 0) {
        isBuyerWithAccess = orders.some(o => allowedStatuses.includes(o.status));
      }
    }

    if (!(isOwner || isAdmin || isBuyerWithAccess)) {
      return res.status(403).json({ error: "Accès refusé au téléchargement" });
    }

    // Create a signed URL (expire short time)
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(file.storage_path, 60 * 5); // 5 minutes
    if (error || !data) {
      console.error("createSignedUrl error:", error);
      return res.status(500).json({ error: "Impossible de générer l'URL" });
    }

    return res.json({ url: data.signedURL, filename: file.filename });
  } catch (err) {
    console.error("getFileDownloadUrl error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message || err });
  }
}

// Delete file (owner or admin)
export async function deleteFile(req, res) {
  try {
    const userId = req.user.sub;
    const { id } = req.params;

    const { data: file, error: fileError } = await supabase
      .from("product_files")
      .select("id, owner_id, storage_path")
      .eq("id", id)
      .single();

    if (fileError || !file) return res.status(404).json({ error: "Fichier introuvable" });

    if (file.owner_id !== userId && !req.user.is_super_admin) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    // Delete storage object
    const { error: delErr } = await supabase.storage.from(BUCKET).remove([file.storage_path]);
    if (delErr) {
      console.error("Supabase storage delete error:", delErr);
      // continue to attempt DB deletion anyway
    }

    // Delete metadata
    const { error: metaDelErr } = await supabase.from("product_files").delete().eq("id", id);
    if (metaDelErr) {
      return res.status(500).json({ error: "Erreur suppression metadata", details: metaDelErr.message || metaDelErr });
    }

    return res.json({ message: "Fichier supprimé" });
  } catch (err) {
    console.error("deleteFile error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message || err });
  }
}

// Seller: list files for a product (owner only)
export async function listFilesForProduct(req, res) {
  try {
    const userId = req.user.sub;
    const { productId } = req.params;

    // verify ownership or admin
    const { data: product } = await supabase.from("products").select("user_id").eq("id", productId).single();
    if (!product) return res.status(404).json({ error: "Produit introuvable" });
    if (product.user_id !== userId && !req.user.is_super_admin) return res.status(403).json({ error: "Accès refusé" });

    const { data, error } = await supabase.from("product_files").select("*").eq("product_id", productId);
    if (error) throw error;

    return res.json({ files: data });
  } catch (err) {
    console.error("listFilesForProduct error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message || err });
  }
  }
