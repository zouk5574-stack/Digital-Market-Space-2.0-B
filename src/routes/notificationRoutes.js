// src/routes/notificationRoutes.js (FINALISÉ)

import { Router } from "express";
// ➡️ CORRECTION: Utilisation du nom du middleware convenu
import { requireAuth } from "../middlewares/authMiddleware.js"; 
import {
  getMyNotifications,
  markAsRead,         // ⬅️ Nom de fonction corrigé pour "markAsRead"
  markAllAsRead,      // ⬅️ Ajout de la route pour marquer tout comme lu
  deleteNotification  // ⬅️ Ajout de la route de suppression
} from "../controllers/notificationController.js";

const router = Router();

// Toutes ces routes nécessitent l'authentification
router.use(requireAuth);

/**
 * 👉 GET /api/notifications/
 * Fonction : Récupérer les notifications de l'utilisateur actuel (non lues en premier).
 */
router.get("/", getMyNotifications);

/**
 * 👉 PUT /api/notifications/:id/read
 * Fonction : Marquer UNE notification spécifique comme lue.
 */
router.put("/:id/read", markAsRead);

/**
 * 👉 PUT /api/notifications/read/all
 * Fonction : Marquer TOUTES les notifications non lues comme lues.
 */
router.put("/read/all", markAllAsRead);


/**
 * 👉 DELETE /api/notifications/:id
 * Fonction : Supprimer une notification spécifique.
 */
router.delete("/:id", deleteNotification);

export default router;
