// src/routes/walletRoutes.js
import express from "express";
import { getWallet, requestWithdrawal, getWithdrawals } from "../controllers/walletController.js";
import { authenticateJWT as authenticateToken } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js"; // Import du middleware de rôle

const router = express.Router();

// Récupérer le solde (Accès pour tout utilisateur authentifié)
router.get("/", authenticateToken, getWallet);

// Demander un retrait (Limité aux Vendeurs et Admin)
router.post("/withdraw", authenticateToken, requireRole(["VENDEUR", "ADMIN"]), requestWithdrawal); 

// Lister les retraits (Accès pour tout utilisateur authentifié)
router.get("/withdrawals", authenticateToken, getWithdrawals);

export default router;
