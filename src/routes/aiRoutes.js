// src/routes/aiRoutes.js
import express from "express";
import { authenticateJWT } from "../middleware/authMiddleware.js";
import { aiRateLimit } from "../middleware/aiRateLimit.js";
import { 
  handleAIMessage, 
  getConversations 
} from "../controllers/aiAssistantController.js";

const router = express.Router();

// Appliquer l'authentification et le rate limiting à toutes les routes IA
router.use(authenticateJWT);
router.use(aiRateLimit);

// Routes de l'assistant IA
router.post("/assistant", handleAIMessage);
router.get("/conversations", getConversations);

export default router;
