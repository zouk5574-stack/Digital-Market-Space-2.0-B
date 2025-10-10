// src/routes/walletRoutes.js

import express from "express";
// ➡️ COHÉRENCE : Utiliser le nom standard 'authenticateJWT'
import { authenticateJWT } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

import { getWallet, requestWithdrawal, getWithdrawals } from "../controllers/walletController.js";

const router = express.Router();

/**
 * 👉 GET /api/wallet/
 * Rôle: Utilisateur Authentifié (Accès à son propre solde)
 */
router.get("/", authenticateJWT, getWallet);

/**
 * 👉 POST /api/wallet/withdraw
 * Rôle: VENDEUR ou ADMIN (Seuls ces rôles peuvent initier un retrait)
 */
router.post(
    "/withdraw", 
    authenticateJWT, 
    requireRole(["VENDEUR", "ADMIN"]), 
    requestWithdrawal
); 

/**
 * 👉 GET /api/wallet/withdrawals
 * Rôle: VENDEUR ou ADMIN (Seuls ces rôles ont un historique de retrait pertinent)
 */
router.get(
    "/withdrawals", 
    authenticateJWT, 
    requireRole(["VENDEUR", "ADMIN"]), // ⬅️ Sécurité renforcée : Seulement pour les utilisateurs qui peuvent retirer.
    getWithdrawals
);

export default router;
