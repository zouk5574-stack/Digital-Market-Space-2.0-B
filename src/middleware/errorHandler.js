import { log } from '../utils/logger.js';

export class AppError extends Error {
  constructor(message, statusCode, isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.statusCode = err.statusCode || 500;

  // Log structuré de l'erreur
  log.error('Erreur API', {
    name: err.name,
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    user: req.user?.id,
    statusCode: error.statusCode,
    timestamp: new Date().toISOString()
  });

  // Erreurs JWT
  if (err.name === 'JsonWebTokenError') {
    error = new AppError('Token JWT invalide', 401);
  }
  if (err.name === 'TokenExpiredError') {
    error = new AppError('Token JWT expiré', 401);
  }

  // Erreurs Supabase/PostgreSQL
  if (err.code) {
    switch (err.code) {
      case '23505': // Violation de contrainte unique
        error = new AppError('Doublon détecté', 409);
        break;
      case '23503': // Violation de clé étrangère
        error = new AppError('Référence non trouvée', 404);
        break;
      case '23502': // Violation de contrainte NOT NULL
        error = new AppError('Champ obligatoire manquant', 400);
        break;
      case '22P02': // Syntaxe invalide
        error = new AppError('Format de données invalide', 400);
        break;
      default:
        // Conserver l'erreur originale si non reconnue
        break;
    }
  }

  // Erreur de validation
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(val => val.message);
    error = new AppError(`Erreur de validation: ${messages.join(', ')}`, 400);
  }

  // CastError (ObjectId invalide pour MongoDB, adapté pour UUID)
  if (err.name === 'CastError') {
    error = new AppError('ID de ressource invalide', 400);
  }

  const response = {
    success: false,
    error: error.message || 'Erreur serveur interne',
    statusCode: error.statusCode,
    timestamp: error.timestamp
  };

  // Stack trace seulement en développement
  if (process.env.NODE_ENV === 'development') {
    response.stack = error.stack;
  }

  res.status(error.statusCode).json(response);
};

// Wrapper async pour éviter les try/catch répétitifs
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};