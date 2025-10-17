// routes/auth.js (VERSION MISE À JOUR)
import express from "express";
import { 
  register, 
  login, 
  superAdminLogin,
  logout 
} from "../controllers/authController.js";
import { authenticateJWT } from "../middleware/authMiddleware.js";

const router = express.Router();

/**
 * POST /api/auth/register
 * body: { username, firstname, lastname, phone, email?, password, role }
 * role = 'ACHETEUR' ou 'VENDEUR'
 */
router.post("/register", register);

/**
 * POST /api/auth/login
 * body: { identifier, password }
 * identifier = phone OU username (email EXCLU pour sécurité)
 */
router.post("/login", login);

/**
 * POST /api/auth/super-admin/login
 * body: { firstname, lastname, phone, password }
 * Connexion sécurisée à 4 champs pour Super Admin uniquement
 */
router.post("/super-admin/login", superAdminLogin);

/**
 * POST /api/auth/logout
 * Déconnexion sécurisée avec logging
 * Headers: { Authorization: "Bearer <token>" }
 */
router.post("/logout", authenticateJWT, logout);

export default router;
