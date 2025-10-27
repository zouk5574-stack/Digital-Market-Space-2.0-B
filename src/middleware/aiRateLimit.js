import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import redis from '../config/redis.js';

// Rate limiting spécifique pour l'IA avec Redis
export const aiRateLimit = rateLimit({
  store: redis ? new RedisStore({
    client: redis,
    prefix: 'rl_ai:'
  }) : undefined,
  
  windowMs: 1 * 60 * 1000, // 1 minute
  max: async (req) => {
    // Limites différentes selon le type d'utilisateur
    if (req.user?.role === 'premium') return 30;
    if (req.user?.role === 'pro') return 20;
    return 10; // Utilisateurs standard
  },
  
  message: {
    success: false,
    error: 'Trop de requêtes vers l\'assistant IA',
    message: 'Veuillez réessayer dans 1 minute',
    retryAfter: 60
  },
  
  standardHeaders: true,
  legacyHeaders: false,
  
  skip: (req) => {
    // Skip pour les admins et certaines IPs
    if (req.user?.role === 'admin') return true;
    if (process.env.WHITELISTED_IPS?.includes(req.ip)) return true;
    return false;
  },
  
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Limite de requêtes IA atteinte',
      message: 'Veuillez patienter avant de faire une nouvelle requête',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  }
});

// Rate limiting pour les uploads de fichiers
export const fileUploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 uploads max
  message: {
    success: false,
    error: 'Trop d\'uploads de fichiers',
    message: 'Veuillez réessayer dans 15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});