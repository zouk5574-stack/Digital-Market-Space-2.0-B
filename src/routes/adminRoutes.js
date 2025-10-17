// src/routes/adminRoutes.js (VERSION MISE À JOUR)

import express from "express";
import { authenticateJWT } from "../middleware/authMiddleware.js";
import { requireRole, requireSuperAdmin } from "../middleware/roleMiddleware.js";
import { 
    listUsers, 
    toggleUserStatus, 
    listWithdrawals, 
    validateWithdrawal,
    rejectWithdrawal,
    getDashboardStats,
    updateCommissionSettings
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
// 💰 Gestion des Retraits (Withdrawals)
// ------------------------------------
// Lister toutes les demandes de retrait en attente
router.get("/withdrawals", listWithdrawals);
// Approuver une demande de retrait
router.post("/withdrawals/:withdrawalId/validate", validateWithdrawal);
// Rejeter une demande de retrait
router.post("/withdrawals/:withdrawalId/reject", rejectWithdrawal);

// ------------------------------------
// 📊 Tableau de bord Admin
// ------------------------------------
// Statistiques générales de la plateforme
router.get("/stats", getDashboardStats);
// Mettre à jour les paramètres de commission
router.put("/settings/commission", updateCommissionSettings);

// ------------------------------------
// 🔔 Gestion des Notifications
// ------------------------------------
// Envoyer une notification en masse
router.post("/notifications/send-bulk", sendBulkNotification);
// Historique des notifications envoyées
router.get("/notifications/history", getNotificationHistory);
// Supprimer une notification (admin)
router.delete("/notifications/:id", adminDeleteNotification);
// Statistiques utilisateurs pour les notifications
router.get("/users/stats", getUserStats);

export default router;