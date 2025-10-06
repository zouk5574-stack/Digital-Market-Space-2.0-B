// routes/paymentProviderRoutes.js
import express from "express";
import {
  createProvider,
  getAllProviders,
  getActiveProvider,
  updateProvider,
  deleteProvider
} from "../controllers/paymentProviderController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// ✅ Public : récupérer le provider actif (ex: Fedapay public_key)
router.get("/active", getActiveProvider);

// ✅ Admin uniquement
router.use(authMiddleware);
router.post("/", createProvider);
router.get("/", getAllProviders);
router.put("/:id", updateProvider);
router.delete("/:id", deleteProvider);

export default router;
