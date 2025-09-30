// routes/notificationRoutes.js
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getMyNotifications,
  markNotificationAsRead
} from "../controllers/notificationController.js";

const router = express.Router();

// 👉 Récupérer mes notifications
router.get("/", protect, getMyNotifications);

// 👉 Marquer une notification comme lue
router.put("/:id/read", protect, markNotificationAsRead);

export default router;
