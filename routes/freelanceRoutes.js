import express from "express";
import { body, param, validationResult } from "express-validator";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  createFreelanceMission,
  applyToMission,
  deliverWork,
  validateDelivery
} from "../controllers/freelanceController.js";

const router = express.Router();

// 🛠 Utilitaire pour validation des requêtes
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  next();
};

// ========================
// ✅ Créer une mission
// ========================
router.post(
  "/missions",
  authMiddleware,
  body("title").isString().notEmpty().withMessage("Le titre est obligatoire"),
  body("description").isString().notEmpty().withMessage("La description est obligatoire"),
  body("budget").isFloat({ min: 0 }).withMessage("Le budget doit être un nombre positif"),
  validateRequest,
  createFreelanceMission
);

// ========================
// ✅ Postuler à une mission
// ========================
router.post(
  "/missions/:id/apply",
  authMiddleware,
  param("id").isString().notEmpty(),
  validateRequest,
  applyToMission
);

// ========================
// ✅ Livrer un travail
// ========================
router.post(
  "/missions/:id/deliver",
  authMiddleware,
  param("id").isString().notEmpty(),
  body("files").isArray({ min: 1 }).withMessage("Au moins un fichier doit être fourni"),
  body("comment").optional().isString(),
  validateRequest,
  deliverWork
);

// ========================
// ✅ Valider une livraison (acheteur)
// ========================
router.put(
  "/missions/:missionId/deliveries/:deliveryId/validate",
  authMiddleware,
  param("missionId").isString().notEmpty(),
  param("deliveryId").isString().notEmpty(),
  validateRequest,
  validateDelivery
);

export default router;
