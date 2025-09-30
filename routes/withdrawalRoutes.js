import express from "express";
import {
  createWithdrawal,
  getMyWithdrawals,
  getAllWithdrawals,
  validateWithdrawal,
  rejectWithdrawal,
} from "../controllers/withdrawalController.js";
import { protect, isAdmin, isSeller } from "../middleware/authMiddleware.js";

const router = express.Router();

// 👉 Créer une demande de retrait (SELLER uniquement)
router.post("/", protect, isSeller, createWithdrawal);

// 👉 Récupérer mes retraits (SELLER uniquement)
router.get("/me", protect, isSeller, getMyWithdrawals);

// 👉 ADMIN : voir toutes les demandes
router.get("/", protect, isAdmin, getAllWithdrawals);

// 👉 ADMIN : valider une demande
router.put("/:id/approve", protect, isAdmin, validateWithdrawal);

// 👉 ADMIN : rejeter une demande
router.put("/:id/reject", protect, isAdmin, rejectWithdrawal);

export default router;
