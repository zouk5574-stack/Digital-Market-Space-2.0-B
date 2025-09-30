import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import {
  createFreelanceMission,
  applyToMission,
  deliverWork,
  validateDelivery
} from "../controllers/freelanceController.js";

const router = express.Router();

// ✅ Créer mission
router.post("/missions", authMiddleware, createFreelanceMission);

// ✅ Postuler à mission
router.post("/applications", authMiddleware, applyToMission);

// ✅ Livrer mission
router.post("/deliveries", authMiddleware, deliverWork);

// ✅ Valider livraison
router.post("/deliveries/validate", authMiddleware, validateDelivery);

export default router;
