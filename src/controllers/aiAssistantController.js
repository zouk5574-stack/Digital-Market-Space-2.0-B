import { openAIService } from '../services/openAIService.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { log } from '../utils/logger.js';

export const aiAssistantController = {
  // Chat avec l'assistant IA
  chat: asyncHandler(async (req, res) => {
    const { message, conversation_history = [] } = req.body;
    const userId = req.user.id;

    if (!message || message.trim().length === 0) {
      throw new AppError('Message requis', 400);
    }

    if (message.length > 1000) {
      throw new AppError('Message trop long (max 1000 caractères)', 400);
    }

    // Préparation de l'historique de conversation
    const messages = [
      ...conversation_history.slice(-10), // Limiter l'historique
      {
        role: 'user',
        content: message.trim()
      }
    ];

    // Contexte utilisateur
    const userContext = {
      userRole: req.user.role,
      completedMissions: req.user.completed_missions,
      completedOrders: req.user.completed_orders,
      userRating: req.user.rating
    };

    const aiResponse = await openAIService.generateAIResponse(
      messages, 
      userId, 
      userContext
    );

    log.info('Interaction IA réussie', { 
      userId, 
      messageLength: message.length,
      responseLength: aiResponse.length 
    });

    res.json({
      success: true,
      data: {
        response: aiResponse,
        conversation_id: `conv_${Date.now()}_${userId}`,
        timestamp: new Date().toISOString()
      }
    });
  }),

  // Analyse de mission avec IA
  analyzeMission: asyncHandler(async (req, res) => {
    const missionData = req.body;
    const userId = req.user.id;

    const requiredFields = ['title', 'description', 'budget', 'category'];
    const missingFields = requiredFields.filter(field => !missionData[field]);

    if (missingFields.length > 0) {
      throw new AppError(`Champs manquants: ${missingFields.join(', ')}`, 400);
    }

    const analysis = await openAIService.analyzeMission(missionData, userId);

    log.info('Analyse de mission par IA', { 
      userId, 
      missionTitle: missionData.title,
      category: missionData.category 
    });

    res.json({
      success: true,
      data: {
        analysis,
        mission_context: {
          title: missionData.title,
          category: missionData.category,
          budget: missionData.budget
        },
        analyzed_at: new Date().toISOString()
      }
    });
  }),

  // Optimisation de description
  optimizeDescription: asyncHandler(async (req, res) => {
    const { description, mission_context } = req.body;
    const userId = req.user.id;

    if (!description || description.trim().length === 0) {
      throw new AppError('Description requise', 400);
    }

    if (description.length > 2000) {
      throw new AppError('Description trop longue (max 2000 caractères)', 400);
    }

    const optimizedDescription = await openAIService.optimizeDescription(
      description,
      mission_context || {},
      userId
    );

    log.info('Description optimisée par IA', { 
      userId,
      originalLength: description.length,
      optimizedLength: optimizedDescription.length 
    });

    res.json({
      success: true,
      data: {
        original_description: description,
        optimized_description: optimizedDescription,
        improvement_ratio: Math.round(
          (optimizedDescription.length / description.length) * 100
        ),
        optimized_at: new Date().toISOString()
      }
    });
  }),

  // Statut du service IA
  getStatus: asyncHandler(async (req, res) => {
    const status = {
      service: 'openai',
      available: !!process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
      max_tokens: 1000,
      rate_limits: {
        standard: '10 req/min',
        premium: '30 req/min',
        pro: '20 req/min'
      },
      features: [
        'chat_assistant',
        'mission_analysis',
        'description_optimization'
      ]
    };

    res.json({
      success: true,
      data: status
    });
  })
};