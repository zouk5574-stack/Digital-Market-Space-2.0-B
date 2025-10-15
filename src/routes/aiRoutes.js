// src/routes/aiRoutes.js
import express from "express";
import { authenticateJWT } from "../middleware/authMiddleware.js";
import { aiRateLimit } from "../middleware/aiRateLimit.js";
import { 
  handleAIMessage, 
  getConversations,
  deleteConversation,
  generateAIContent
} from "../controllers/aiAssistantController.js";

const router = express.Router();

router.use(authenticateJWT);
router.use(aiRateLimit);

// Routes de l'assistant IA
router.post("/assistant", handleAIMessage);
router.get("/conversations", getConversations);
router.delete("/conversations/:conversationId", deleteConversation);
router.post("/generate-content", generateAIContent);

export default router;
