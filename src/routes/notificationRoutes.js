// src/routes/notificationRoutes.js

import express from "express";
// ➡️ COHÉRENCE : Utiliser le nom du middleware défini
import { authenticateJWT } from "../middleware/authMiddleware.js"; 
import {
  getMyNotifications,
  markNotificationAsRead
} from "../controllers/notificationController.js";

const router = express.Router();

/**
 * 👉 GET /api/notifications/
 * Rôle: Utilisateur authentifié (Acheteur/Vendeur/Admin)
 * Fonction : Récupérer les notifications de l'utilisateur actuel.
 */
router.get("/", authenticateJWT, getMyNotifications);

/**
 * 👉 PUT /api/notifications/:id/read
 * Rôle: Utilisateur authentifié
 * Fonction : Marquer une notification spécifique comme lue.
 */
router.put("/:id/read", authenticateJWT, markNotificationAsRead);

export default router;
