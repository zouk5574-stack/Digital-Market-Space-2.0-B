// routes/logRoutes.js
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { getLogs } from "../controllers/logController.js";

const router = express.Router();

// 👉 Voir tous les logs (admin uniquement)
router.get("/", protect, getLogs);

export default router;
