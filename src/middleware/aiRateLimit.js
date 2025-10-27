import rateLimit from 'express-rate-limit';
import logger from '../utils/logger.js';

// Rate limiting spécifique pour l'IA
export const aiRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5, // 5 requêtes maximum par minute
  message: {
    success: false,
    error: 'Limite de requêtes IA atteinte',
    message: 'Veuillez patienter avant de faire une nouvelle requête IA'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Utiliser l'ID utilisateur comme clé pour le rate limiting
    return req.user?.id || req.ip;
  },
  handler: (req, res) => {
    logger.warn('Limite de requêtes IA atteinte', {
      userId: req.user?.id,
      ip: req.ip,
      path: req.path
    });
    
    res.status(429).json({
      success: false,
      error: 'Limite de requêtes IA atteinte',
      message: 'Veuillez patienter 1 minute avant de faire une nouvelle requête IA',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000) - Math.floor(Date.now() / 1000)
    });
  }
});

// Rate limiting plus permissif pour les utilisateurs premium
export const premiumAiRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 15, // 15 requêtes maximum par minute pour les premium
  message: {
    success: false,
    error: 'Limite de requêtes IA premium atteinte',
    message: 'Veuillez patienter avant de faire une nouvelle requête IA'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  },
  skip: (req) => {
    // Sauter le rate limiting pour les utilisateurs premium
    // Implémenter la logique premium selon votre système
    return req.user?.role_id === 1 || req.user?.is_premium === true; // Admins ou premium
  },
  handler: (req, res) => {
    logger.warn('Limite de requêtes IA premium atteinte', {
      userId: req.user?.id,
      ip: req.ip,
      path: req.path
    });
    
    res.status(429).json({
      success: false,
      error: 'Limite de requêtes IA atteinte',
      message: 'Veuillez patienter 1 minute avant de faire une nouvelle requête IA',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000) - Math.floor(Date.now() / 1000)
    });
  }
});

// Rate limiting pour les endpoints spécifiques d'IA
export const createAiRateLimit = (options = {}) => {
  const defaultOptions = {
    windowMs: options.windowMs || 1 * 60 * 1000,
    max: options.max || 5,
    message: {
      success: false,
      error: 'Limite de requêtes IA atteinte',
      message: options.message || 'Veuillez patienter avant de faire une nouvelle requête IA'
    },
    standardHeaders: true,
    legacyHeaders: false
  };

  return rateLimit({ ...defaultOptions, ...options });
};

// Middleware pour logger les utilisations de l'IA
export const aiUsageLogger = (req, res, next) => {
  const startTime = Date.now();
  
  // Intercepter la réponse pour logger l'usage
  const originalSend = res.send;
  
  res.send = function(data) {
    const responseTime = Date.now() - startTime;
    
    if (res.statusCode === 200) {
      logger.info('Usage IA enregistré', {
        userId: req.user?.id,
        endpoint: req.path,
        method: req.method,
        responseTime: `${responseTime}ms`,
        timestamp: new Date().toISOString()
      });
    }
    
    originalSend.call(this, data);
  };
  
  next();
};

export default {
  aiRateLimit,
  premiumAiRateLimit,
  createAiRateLimit,
  aiUsageLogger
};