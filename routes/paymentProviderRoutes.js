// routes/paymentProviderRoutes.js
import express from "express";
import {
  createProvider,
  getAllProviders,
  getActiveProvider,
  updateProvider,
  deleteProvider,
} from "../controllers/paymentProviderController.js";

import { authenticateJWT as authMiddleware } from "../middleware/authMiddleware.js";
import { requireSuperAdmin } from "../middleware/roleMiddleware.js"; // Ajout du super admin

const router = express.Router();

// Route publique : récupération du provider actif (ex: Fedapay public_key)
router.get("/active", getActiveProvider);

// Les routes suivantes nécessitent une authentification et le rôle Super Admin
router.use(authMiddleware, requireSuperAdmin); // Seul le Super Admin gère les providers

// CRUD admin
router.post("/", createProvider);
router.get("/", getAllProviders);
router.put("/:id", updateProvider);
router.delete("/:id", deleteProvider);

export default router;
