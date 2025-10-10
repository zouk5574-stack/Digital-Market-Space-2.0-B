// src/routes/adminRoutes.js

import express from "express";
import { authenticateJWT } from "../middleware/authMiddleware.js";
import { requireRole, requireSuperAdmin } from "../middleware/roleMiddleware.js";
import { 
    listUsers, 
    toggleUserStatus, 
    listPayouts, 
    processPayout 
} from "../controllers/adminController.js";

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
// 📊 Logs d'activité (Optionnel : si vous avez une table de logs)
// ------------------------------------
// router.get("/logs", listSystemLogs);

export default router;
