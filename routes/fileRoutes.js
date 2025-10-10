// src/routes/fileRoutes.js

import express from "express";
import multer from "multer";
import {
  uploadFile,
  getFileDownloadUrl,
  deleteFile,
  listFilesForProduct,
} from "../controllers/fileController.js";
// ✅ Utilisation du nom du middleware que nous avons défini
import { authenticateJWT } from "../middleware/authMiddleware.js"; 

const router = express.Router();

// ⚡ Multer memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

// 👉 POST /api/files/upload : Upload fichier pour un produit (vendeur ou admin)
router.post(
  "/upload",
  authenticateJWT,
  upload.single("file"), 
  uploadFile
);

// 👉 GET /api/files/product/:productId : Lister fichiers d’un produit (owner/admin)
router.get("/product/:productId", authenticateJWT, listFilesForProduct);

// 👉 GET /api/files/download/:id : Générer URL de téléchargement (acheteur, owner, admin)
router.get("/download/:id", authenticateJWT, getFileDownloadUrl);

// 👉 DELETE /api/files/:id : Supprimer fichier (owner ou admin)
router.delete("/:id", authenticateJWT, deleteFile);

export default router;
