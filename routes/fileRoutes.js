// routes/fileRoutes.js
import express from "express";
import multer from "multer";
import {
  uploadFile,
  getFileDownloadUrl,
  deleteFile,
  listFilesForProduct,
} from "../controllers/fileController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// ⚡ Multer memory storage (pas de fichier temporaire sur disque)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// 👉 Upload fichier pour un produit (vendeur ou admin)
router.post(
  "/upload",
  protect,
  upload.single("file"), // champ "file" en multipart/form-data
  uploadFile
);

// 👉 Lister fichiers d’un produit (owner/admin)
router.get("/product/:productId", protect, listFilesForProduct);

// 👉 Générer URL de téléchargement (acheteur avec commande valide, owner, admin)
router.get("/download/:id", protect, getFileDownloadUrl);

// 👉 Supprimer fichier (owner ou admin)
router.delete("/:id", protect, deleteFile);

export default router;
