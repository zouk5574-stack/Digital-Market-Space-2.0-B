// routes/fileRoutes.js
import express from "express";
import multer from "multer";
import { authenticateJWT } from "../middleware/authMiddleware.js";
import {
  uploadFile,
  getFileDownloadUrl,
  deleteFile,
  listFilesForProduct
} from "../controllers/fileController.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// SELLER upload file for product
router.post("/upload", authenticateJWT, upload.single("file"), uploadFile);

// Seller list files for his product
router.get("/product/:productId", authenticateJWT, listFilesForProduct);

// Download file (signed URL) - buyer/seller/admin with authorization checked in controller
router.get("/:id/download", authenticateJWT, getFileDownloadUrl);

// Delete file (owner or admin)
router.delete("/:id", authenticateJWT, deleteFile);

export default router;
