// src/routes/logRoutes.js

import express from "express";
// ➡️ COHÉRENCE : Utiliser les noms de middlewares définis
import { authenticateJWT } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js"; 
import { getLogs } from "../controllers/logController.js";

const router = express.Router();

/**
 * 👉 GET /api/logs/
 * Rôle: ADMIN (ou SUPER_ADMIN) uniquement.
 * Fonction : Récupérer les logs système ou d'activité pour la surveillance.
 */
router.get(
    "/", 
    authenticateJWT, 
    requireRole(["ADMIN", "SUPER_ADMIN"]), // ⬅️ SÉCURITÉ CRITIQUE : Seuls les Admins peuvent voir les logs
    getLogs
);

export default router;
