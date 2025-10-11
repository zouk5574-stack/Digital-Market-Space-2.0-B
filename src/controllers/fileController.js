// =========================================================
// src/controllers/fileController.js (FINALISÉ avec Optimisation)
// =========================================================

import { supabase } from "../server.js";
import { v4 as uuidv4 } from "uuid";
import mime from "mime-types";
import sharp from 'sharp'; // 🚨 NOUVEL IMPORT

// Récupération de l'URL de base pour les URLs publiques (nécessite d'être défini dans .env)
const supabaseUrl = process.env.SUPABASE_URL; 

// Configs (via env - utilisées si .env est chargé avant ce fichier)
const BUCKET = process.env.SUPABASE_FILES_BUCKET || "product-files";
const MAX_FILE_BYTES = Number(process.env.MAX_FILE_BYTES || 50 * 1024 * 1024); // 50 MB
const ALLOWED_MIMES = (process.env.ALLOWED_MIMES || "image/jpeg,image/png,image/webp,video/mp4,application/pdf,application/zip").split(",");
const ONE_HOUR_THIRTY_MINUTES_IN_SECONDS = 5400; // 1h30

// ---------------------------------------------------------
// 🚨 LOGIQUE D'OPTIMISATION À 95% 
// ---------------------------------------------------------
async function optimizeImage(buffer, mimetype) {
    // Si c'est un JPEG, on optimise à 95% de qualité
    if (mimetype.startsWith('image/jpeg') || mimetype.startsWith('image/jpg')) {
        console.log(`-> Optimisation JPEG (Qualité 95%) : ${buffer.length} octets...`);
        try {
            const optimizedBuffer = await sharp(buffer)
                // Redimensionnement max pour les vignettes/aperçus (non destructif)
                .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 95 }) // Qualité 95%
                .toBuffer();
            
            console.log(`-> Optimisation terminée (Taille finale: ${optimizedBuffer.length} octets).`);
            return { buffer: optimizedBuffer, size: optimizedBuffer.length };

        } catch (err) {
            console.error("Erreur sharp, utilisation du buffer original.", err);
            return { buffer: buffer, size: buffer.length }; 
        }
    }
    // Si ce n'est pas une image JPEG, ou si c'est un autre type (PNG, PDF, ZIP), on utilise l'original
    return { buffer: buffer, size: buffer.length };
}


// -----------------------------
// 1. Upload file (seller or admin)
// -----------------------------
export async function uploadFile(req, res) {
  try {
    const userId = req.user.db.id; 
    const { product_id } = req.body;

    if (!product_id) return res.status(400).json({ error: "product_id requis" });
    if (!req.file) return res.status(400).json({ error: "Fichier requis (multipart/form-data, champ 'file')" });

    let { originalname, mimetype, size, buffer } = req.file;

    // Validation MIME & Size (basée sur le fichier original)
    if (!ALLOWED_MIMES.includes(mimetype)) {
      return res.status(400).json({ error: "Type de fichier non autorisé" });
    }
    if (size > MAX_FILE_BYTES) {
      return res.status(400).json({ error: `Fichier trop volumineux (max ${MAX_FILE_BYTES / (1024 * 1024)} MB)` });
    }

    // 🚨 Étape d'Optimisation : Remplace le buffer et la taille si c'est une image
    const optimized = await optimizeImage(buffer, mimetype);
    buffer = optimized.buffer;
    size = optimized.size; 

    // Verify product exists and ownership
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, owner_id") // 🚨 Assurez-vous que le champ est 'owner_id' dans la table products
      .eq("id", product_id)
      .limit(1)
      .single();

    if (productError || !product) return res.status(404).json({ error: "Produit introuvable" });

    if (product.owner_id !== userId && !req.user.db.is_super_admin) { 
      return res.status(403).json({ error: "Accès refusé : vous n'êtes pas le propriétaire du produit" });
    }

    // Build storage path
    const ext = mime.extension(mimetype) || originalname.split(".").pop();
    const generatedName = `${uuidv4()}.${ext}`;
    const storagePath = `${userId}/${product_id}/${generatedName}`;

    // Upload to Supabase Storage (utilise le buffer potentiellement optimisé)
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

    // Insert metadata (utilise la nouvelle taille optimisée)
    const { data: meta, error: metaErr } = await supabase
      .from("product_files")
      .insert([{
        product_id,
        owner_id: userId, 
        storage_path: storagePath,
        filename: originalname,
        content_type: mimetype,
        size_bytes: size, // 🚨 Taille du fichier optimisé
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

    const publicURL = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${storagePath}`;

    return res.status(201).json({ 
        message: "Fichier uploadé et optimisé ✅", 
        file: { ...meta, url: publicURL }
    });
  } catch (err) {
    console.error("uploadFile error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message || err });
  }
}

// -------------------------------------------------------
// 2. Get signed download URL (buyer/seller/admin authorization)
// ... (Le reste du contrôleur reste inchangé, car sa logique est correcte)
// -------------------------------------------------------
// ...
