// =========================================================
// src/routes/fileRoutes.js (VERSION COMPLÈTE OPTIMISÉE)
// =========================================================

import express from 'express';
import multer from 'multer';
import {
  uploadFile,
  getFileDownloadUrl,
  deleteFile,
  listFilesForProduct,
} from '../controllers/fileController.js';
import { authenticateJWT } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * ==========================================
 * 📦 FILE MANAGEMENT ROUTES
 * ==========================================
 */

// ⚙️ Configuration Multer (stockage mémoire sécurisé)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

/**
 * @route POST /api/files/upload
 * @description Upload d’un fichier (produit digital, portfolio freelance, etc.)
 * @access Private (vendeur ou admin)
 */
router.post('/upload', authenticateJWT, upload.single('file'), uploadFile);

/**
 * @route GET /api/files/product/:productId
 * @description Liste tous les fichiers associés à un produit
 * @access Private (propriétaire du produit ou admin)
 */
router.get('/product/:productId', authenticateJWT, listFilesForProduct);

/**
 * @route GET /api/files/download/:id
 * @description Génère une URL temporaire pour télécharger un fichier
 * @access Private (acheteur, propriétaire, ou admin)
 */
router.get('/download/:id', authenticateJWT, getFileDownloadUrl);

/**
 * @route DELETE /api/files/:id
 * @description Supprime un fichier du produit
 * @access Private (propriétaire ou admin)
 */
router.delete('/:id', authenticateJWT, deleteFile);

export default router;