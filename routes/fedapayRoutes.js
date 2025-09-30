import express from "express";
import { createFedapayTransaction, fedapayCallback } from "../controllers/fedapayController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// ✅ Créer une transaction
router.post("/create", protect, createFedapayTransaction);

// ✅ Callback webhook (Fedapay appelle cette route)
router.post("/callback", fedapayCallback);

export default router;
