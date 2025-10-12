import express from "express";
import { body, param, validationResult } from "express-validator";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js"; 
import {
  createFreelanceMission,
  applyToMission,
  assignSellerToMission, // ⬅️ Fonction Escrow importée
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
// 1. Créer une mission (ACHETEUR/ADMIN)
// ========================
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

// ========================
// 2. Postuler à une mission (VENDEUR/ADMIN)
// ========================
router.post(
  "/missions/:id/apply",
  authMiddleware,
  requireRole(["VENDEUR", "ADMIN"]), 
  param("id").isUUID().withMessage("ID de mission invalide"),
  body("proposal").isString().notEmpty().withMessage("La proposition est obligatoire"),
  body("proposed_price").isFloat({ min: 1 }).withMessage("Le prix proposé doit être un nombre positif (minimum 1)"),
  validateRequest,
  applyToMission
);

// 🛑 ========================
// 3. Attribuer un vendeur (ACHETEUR/ADMIN) - AVEC ESCROW
// ========================
router.post(
  "/missions/:missionId/assign",
  authMiddleware,
  requireRole(["ACHETEUR", "ADMIN"]), 
  param("missionId").isUUID().withMessage("ID de mission invalide"),
  body("application_id").isUUID().withMessage("L'ID de la candidature est obligatoire"), // Nécessaire pour obtenir le vendeur et le prix
  validateRequest,
  assignSellerToMission // ⬅️ La fonction Escrow est appelée ici
);


// ========================
// 4. Livrer un travail (VENDEUR/ADMIN)
// ========================
router.post(
  "/missions/:id/deliver",
  authMiddleware,
  requireRole(["VENDEUR", "ADMIN"]), 
  param("id").isUUID().withMessage("ID de mission invalide"),
  body("file_url").isURL().withMessage("L'URL du fichier de livraison est obligatoire et doit être valide"),
  body("delivery_note").isString().notEmpty().withMessage("Une note de livraison est requise"),
  validateRequest,
  deliverWork
);

// ========================
// 5. Valider une livraison (ACHETEUR/ADMIN)
// ========================
router.put(
  "/missions/:missionId/deliveries/:deliveryId/validate",
  authMiddleware,
  requireRole(["ACHETEUR", "ADMIN"]), 
  param("missionId").isUUID().withMessage("ID de mission invalide"),
  param("deliveryId").isUUID().withMessage("ID de livraison invalide"),
  validateRequest,
  validateDelivery
);

export default router;
