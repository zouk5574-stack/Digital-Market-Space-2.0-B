import express from "express";
import {
  createWithdrawal,
  getMyWithdrawals,
  getAllWithdrawals,
  validateWithdrawal,
  rejectWithdrawal,
} from "../controllers/withdrawalController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// 👉 Créer une demande de retrait
router.post("/", protect, createWithdrawal);

// 👉 Récupérer mes retraits
router.get("/me", protect, getMyWithdrawals);

// 👉 ADMIN : voir toutes les demandes
router.get("/", protect, getAllWithdrawals);

// 👉 ADMIN : valider une demande
router.put("/:id/approve", protect, validateWithdrawal);

// 👉 ADMIN : rejeter une demande
router.put("/:id/reject", protect, rejectWithdrawal);

export default router;
