// src/routes/withdrawalRoutes.js

import express from "express";
// ➡️ COHÉRENCE : Utiliser les noms de middlewares définis
import { authenticateJWT } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js"; 

import {
  createWithdrawal,
  getMyWithdrawals,
  getAllWithdrawals,
  validateWithdrawal,
  rejectWithdrawal,
} from "../controllers/withdrawalController.js";

const router = express.Router();

// Rôles pour le Vendeur (Inclut l'Admin par flexibilité)
const SELLER_ROLES = ["VENDEUR", "ADMIN", "SUPER_ADMIN"]; 
// Rôles pour l'Administration (pour les actions critiques)
const ADMIN_ROLES = ["ADMIN", "SUPER_ADMIN"]; 


// ------------------------------------
// Actions du Vendeur (Création/Historique)
// ------------------------------------

/**
 * 👉 POST /api/withdrawals/
 * Rôle: VENDEUR / ADMIN : Créer une demande de retrait
 */
router.post(
    "/", 
    authenticateJWT, 
    requireRole(SELLER_ROLES), 
    createWithdrawal
);

/**
 * 👉 GET /api/withdrawals/me
 * Rôle: VENDEUR / ADMIN : Récupérer mes demandes de retraits
 */
router.get(
    "/me", 
    authenticateJWT, 
    requireRole(SELLER_ROLES), 
    getMyWithdrawals
);


// ------------------------------------
// Actions Administrateur (Gestion Globale)
// ------------------------------------

/**
 * 👉 GET /api/withdrawals/
 * Rôle: ADMIN : voir toutes les demandes de retraits
 */
router.get(
    "/", 
    authenticateJWT, 
    requireRole(ADMIN_ROLES), 
    getAllWithdrawals
);

/**
 * 👉 PUT /api/withdrawals/:id/approve
 * Rôle: ADMIN : valider une demande de retrait
 */
router.put(
    "/:id/approve", 
    authenticateJWT, 
    requireRole(ADMIN_ROLES), 
    validateWithdrawal
);

/**
 * 👉 PUT /api/withdrawals/:id/reject
 * Rôle: ADMIN : rejeter une demande de retrait
 */
router.put(
    "/:id/reject", 
    authenticateJWT, 
    requireRole(ADMIN_ROLES), 
    rejectWithdrawal
);

export default router;
