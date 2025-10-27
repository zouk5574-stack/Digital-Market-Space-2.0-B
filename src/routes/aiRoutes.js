import express from 'express';
import { aiAssistantController } from '../controllers/aiAssistantController.js';
import { authenticateJWT } from '../middleware/authMiddleware.js';
import { aiRateLimit } from '../middleware/aiRateLimit.js';
import { validate } from '../utils/validators.js';

const router = express.Router();

// Toutes les routes IA nécessitent une authentification
router.use(authenticateJWT);

// Rate limiting spécifique pour l'IA
router.use(aiRateLimit);

// Chat avec l'assistant IA
router.post(
  '/chat',
  validate({
    message: 'string|min:1|max:1000',
    conversation_history: 'array|optional'
  }),
  aiAssistantController.chat
);

// Analyse de mission avec IA
router.post(
  '/analyze-mission',
  validate({
    title: 'string|required|min:5|max:255',
    description: 'string|required|min:10|max:5000',
    budget: 'number|required|min:0|max:1000000',
    category: 'string|required|in:design,development,marketing,writing,translation,support',
    deadline: 'date|required|after:today'
  }),
  aiAssistantController.analyzeMission
);

// Optimisation de description
router.post(
  '/optimize-description',
  validate({
    description: 'string|required|min:10|max:2000',
    mission_context: 'object|optional'
  }),
  aiAssistantController.optimizeDescription
);

// Statut du service IA
router.get('/status', aiAssistantController.getStatus);

export default router;