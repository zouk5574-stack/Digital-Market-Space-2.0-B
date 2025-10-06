// routes/paymentProviderRoutes.js
import express from "express";
import {
  createProvider,
  getAllProviders,
  getActiveProvider,
  updateProvider,
  deleteProvider,
} from "../controllers/paymentProviderController.js";

// ✅ On importe la bonne version du middleware (chemin correct et cohérent)
import { authenticateJWT as authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// ✅ Route publique : récupération du provider actif (ex: Fedapay public_key)
router.get("/active", getActiveProvider);

// ✅ Toutes les routes suivantes nécessitent une authentification (admin)
router.use(authMiddleware);

// ✅ CRUD admin
router.post("/", createProvider);
router.get("/", getAllProviders);
router.put("/:id", updateProvider);
router.delete("/:id", deleteProvider);

export default router;
