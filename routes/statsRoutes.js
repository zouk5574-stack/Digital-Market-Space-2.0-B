// routes/statsRoutes.js
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { getAdminStats } from "../controllers/statsController.js";

const router = express.Router();

// 👉 Admin Dashboard Stats
router.get("/", protect, getAdminStats);

export default router;
