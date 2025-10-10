import express from "express";
import { body, param, validationResult } from "express-validator";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js"; // ⬅️ IMPORT CRITIQUE
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
// ✅ Créer une mission (ACHETEUR/ADMIN)
// ========================
router.post(
  "/missions",
  authMiddleware,
  requireRole(["ACHETEUR", "ADMIN"]), // ⬅️ SÉCURITÉ PAR RÔLE
  body("title").isString().notEmpty().withMessage("Le titre est obligatoire"),
  body("description").isString().notEmpty().withMessage("La description est obligatoire"),
  body("budget").isFloat({ min: 1 }).withMessage("Le budget doit être un nombre positif (minimum 1)"),
  body("deadline").optional().isISO8601().withMessage("Format de date invalide"),
  validateRequest,
  createFreelanceMission
);

// ========================
// ✅ Postuler à une mission (VENDEUR/ADMIN)
// ========================
router.post(
  "/missions/:id/apply",
  authMiddleware,
  requireRole(["VENDEUR", "ADMIN"]), // ⬅️ SÉCURITÉ PAR RÔLE
  param("id").isUUID().withMessage("ID de mission invalide"),
  body("proposal").isString().notEmpty().withMessage("La proposition est obligatoire"),
  body("proposed_price").isFloat({ min: 1 }).withMessage("Le prix proposé doit être un nombre positif (minimum 1)"),
  validateRequest,
  applyToMission
);

// ========================
// ✅ Livrer un travail (VENDEUR/ADMIN)
// La vérification que le VENDEUR est celui assigné à la mission se fera dans le Controller.
// ========================
router.post(
  "/missions/:id/deliver",
  authMiddleware,
  requireRole(["VENDEUR", "ADMIN"]), // ⬅️ SÉCURITÉ PAR RÔLE
  param("id").isUUID().withMessage("ID de mission invalide"),
  // Le champ 'file_url' du schéma 'freelance_deliveries' indique qu'on devrait avoir un lien.
  body("file_url").isURL().withMessage("L'URL du fichier de livraison est obligatoire et doit être valide"),
  body("delivery_note").isString().notEmpty().withMessage("Une note de livraison est requise"),
  validateRequest,
  deliverWork
);

// ========================
// ✅ Valider une livraison (ACHETEUR/ADMIN)
// L'acheteur doit être celui qui a créé la mission. Vérification dans le Controller.
// ========================
router.put(
  "/missions/:missionId/deliveries/:deliveryId/validate",
  authMiddleware,
  requireRole(["ACHETEUR", "ADMIN"]), // ⬅️ SÉCURITÉ PAR RÔLE
  param("missionId").isUUID().withMessage("ID de mission invalide"),
  param("deliveryId").isUUID().withMessage("ID de livraison invalide"),
  validateRequest,
  validateDelivery
);

export default router;
