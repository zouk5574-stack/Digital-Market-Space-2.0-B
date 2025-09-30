import express from "express";
import { setFedapayKeys, getFedapayKeys } from "../controllers/paymentController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// ✅ Admin configure les clés
router.post("/fedapay", protect, setFedapayKeys);

// ✅ Admin récupère les clés actuelles
router.get("/fedapay", protect, getFedapayKeys);

export default router;
