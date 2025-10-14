// src/routes/adminRoutes.js (VERSION CORRIGÉE)

import express from "express";
import { authenticateJWT } from "../middleware/authMiddleware.js";
import { requireRole, requireSuperAdmin } from "../middleware/roleMiddleware.js";
import { 
    listUsers, 
    toggleUserStatus, 
    listPayouts, 
    processPayout 
} from "../controllers/adminController.js";
import { 
    sendBulkNotification,
    getNotificationHistory,
    adminDeleteNotification,
    getUserStats
} from "../controllers/notificationController.js";

const router = express.Router();

// Appliquer les middlewares d'authentification et de rôle pour toutes les routes Admin
router.use(authenticateJWT, requireRole(["ADMIN", "SUPER_ADMIN"]));

// ------------------------------------
// 🧑‍💻 Gestion des Utilisateurs
// ------------------------------------
// Lister tous les utilisateurs
router.get("/users", listUsers);
// Bloquer/débloquer un utilisateur (Ex: bloquer un VENDEUR malveillant)
router.put("/users/:userId/status", toggleUserStatus);

// ------------------------------------
// 💰 Gestion des Retraits (Payouts)
// ------------------------------------
// Lister toutes les demandes de retrait en attente
router.get("/payouts", listPayouts);
// Approuver ou rejeter une demande de retrait
router.post("/payouts/:payoutId/process", processPayout);

// ------------------------------------
// 🔔 Gestion des Notifications (NOUVEAU)
// ------------------------------------
// Envoyer une notification en masse
router.post("/notifications/send-bulk", sendBulkNotification);
// Historique des notifications envoyées
router.get("/notifications/history", getNotificationHistory);
// Supprimer une notification (admin)
router.delete("/notifications/:id", adminDeleteNotification);
// Statistiques utilisateurs pour les notifications
router.get("/users/stats", getUserStats);

// ------------------------------------
// 📊 Logs d'activité (Optionnel : si vous avez une table de logs)
// ------------------------------------
// router.get("/logs", listSystemLogs);

export default router;
