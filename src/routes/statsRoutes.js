// src/routes/statsRoutes.js (FINALISÉ)

import express from "express";
import { authenticateJWT } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js"; // ⬅️ Ajout du middleware de rôle
import {
  getAdminStats,
  getStats, 
  exportStatsExcel,
  exportStatsPDF
} from "../controllers/statsController.js";

const router = express.Router();

// ------------------------------------
// 1. Stats Administrateur (Globales)
// ------------------------------------

// 📊 Récupérer stats globales (dashboard admin)
router.get(
    "/admin", 
    authenticateJWT, 
    requireRole(["ADMIN", "SUPER_ADMIN"]), // ⬅️ Sécurité : Rôle Admin requis
    getAdminStats
);

// 📤 Exporter stats en Excel (Admin)
router.get(
    "/export/excel", 
    authenticateJWT, 
    requireRole(["ADMIN", "SUPER_ADMIN"]), // ⬅️ Sécurité : Rôle Admin requis
    exportStatsExcel
);

// 📤 Exporter stats en PDF (Admin)
router.get(
    "/export/pdf", 
    authenticateJWT, 
    requireRole(["ADMIN", "SUPER_ADMIN"]), // ⬅️ Sécurité : Rôle Admin requis
    exportStatsPDF
);

// ------------------------------------
// 2. Stats Utilisateur (Statistiques individuelles)
// ------------------------------------

// 📊 Récupérer stats individuelles (ventes, commandes, etc. de l'utilisateur)
router.get(
    "/", 
    authenticateJWT, 
    // Pas de requireRole, mais le contrôleur doit filtrer par req.user.db.id
    getStats 
);

export default router;
