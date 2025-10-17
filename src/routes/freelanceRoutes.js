// src/routes/freelanceRoutes.js (FINAL)

import express from "express";
import { body, param, validationResult } from "express-validator";
// ⚠️ ASSUMPTION: Ces imports doivent être adaptés à votre structure de middlewares
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js"; 
import {
  createFreelanceMission,
  applyToMission,
  acceptFreelanceApplication, 
  deliverWork,
  validateMissionDelivery
} from "../controllers/freelanceController.js"; 

const router = express.Router();

/**
 * Middleware utilitaire pour gérer les erreurs de validation Express-Validator
 */
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  next();
};

// ====================================================================
// 1. Créer une mission (ACHETEUR/ADMIN)
// POST /api/freelance/missions
// ====================================================================
router.post(
  "/missions",
  authMiddleware,
  requireRole(["ACHETEUR", "ADMIN"]), 
  body("title").isString().notEmpty().withMessage("Le titre est obligatoire"),
  body("description").isString().notEmpty().withMessage("La description est obligatoire"),
  body("budget").isFloat({ min: 1 }).withMessage("Le budget doit être un nombre positif (minimum 1)"),
  body("deadline").optional().isISO8601().withMessage("Format de date invalide"),
  validateRequest,
  createFreelanceMission
);

// ====================================================================
// 2. Postuler à une mission (VENDEUR/ADMIN)
// POST /api/freelance/applications
// ====================================================================
router.post(
  "/applications",
  authMiddleware,
  requireRole(["VENDEUR", "ADMIN"]), 
  body("mission_id").isUUID().withMessage("ID de mission invalide"),
  body("proposal").isString().notEmpty().withMessage("La proposition est obligatoire"),
  body("proposed_price").isFloat({ min: 1 }).withMessage("Le prix proposé doit être un nombre positif (minimum 1)"),
  validateRequest,
  applyToMission
);

// ====================================================================
// 3. Accepter Candidature & INITIER ESCROW (ACHETEUR/ADMIN)
// POST /api/freelance/applications/accept
// Ceci déclenche le processus de paiement Escrow.
// ====================================================================
router.post(
  "/applications/accept",
  authMiddleware,
  requireRole(["ACHETEUR", "ADMIN"]), 
  body("application_id").isUUID().withMessage("L'ID de la candidature est obligatoire"),
  validateRequest,
  acceptFreelanceApplication
);


// ====================================================================
// 4. Livrer un travail (VENDEUR/ADMIN)
// POST /api/freelance/deliveries
// ====================================================================
router.post(
  "/deliveries",
  authMiddleware,
  requireRole(["VENDEUR", "ADMIN"]), 
  body("mission_id").isUUID().withMessage("ID de mission invalide"),
  body("file_url").isURL().withMessage("L'URL du fichier de livraison est obligatoire et doit être valide"),
  body("delivery_note").isString().notEmpty().withMessage("Une note de livraison est requise"),
  validateRequest,
  deliverWork
);

// ====================================================================
// 5. Valider une livraison & DEBLOQUER ESCROW (ACHETEUR/ADMIN)
// PUT /api/freelance/deliveries/:deliveryId/validate
// ====================================================================
router.put(
  "/deliveries/:deliveryId/validate",
  authMiddleware,
  requireRole(["ACHETEUR", "ADMIN"]), 
  param("deliveryId").isUUID().withMessage("ID de livraison invalide"),
  validateRequest,
  validateMissionDelivery
);

export default router;
