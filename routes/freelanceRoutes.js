import express from "express";
import {
  createFreelanceMission,
  applyToMission,
  deliverWork,
  validateDelivery
} from "../controllers/freelanceController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Missions freelance
router.post("/missions", authenticateToken, createFreelanceMission);
router.post("/apply", authenticateToken, applyToMission);

// Livraison
router.post("/deliver", authenticateToken, deliverWork);
router.post("/validate", authenticateToken, validateDelivery);

export default router;
