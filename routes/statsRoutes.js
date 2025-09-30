// routes/stats.js
import express from "express";
import { authenticateJWT } from "../middleware/authMiddleware.js";
import {
  getAdminStats,
  getStats,
  exportStatsExcel,
  exportStatsPDF
} from "../controllers/statsController.js";

const router = express.Router();

// 📊 Récupérer stats globales (dashboard admin)
router.get("/admin", authenticateJWT, getAdminStats);

// 📊 Récupérer stats financières
router.get("/", authenticateJWT, getStats);

// 📤 Exporter stats en Excel
router.get("/export/excel", authenticateJWT, exportStatsExcel);

// 📤 Exporter stats en PDF
router.get("/export/pdf", authenticateJWT, exportStatsPDF);

export default router;
