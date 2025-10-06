import express from "express";
import { authMiddleware } from "/middleware/authMiddleware.js";
import {
  createFreelanceMission,
  applyToMission,
  deliverWork,
  validateDelivery
} from "./controllers/freelanceController.js";

const router = express.Router();

// ✅ Créer une mission freelance
router.post("/missions", authMiddleware, createFreelanceMission);

// ✅ Postuler à une mission
router.post("/applications", authMiddleware, applyToMission);

// ✅ Livrer un travail
router.post("/deliveries", authMiddleware, deliverWork);

// ✅ Valider une livraison (acheteur)
router.put("/deliveries/:id/validate", authMiddleware, validateDelivery);

export default router;
