const Joi = require('joi');
const logger = require('../utils/logger');

// Schémas de validation réutilisables
const commonValidators = {
  id: Joi.string().uuid().required(),
  email: Joi.string().email().max(255).required(),
  phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
  amount: Joi.number().integer().min(100).max(1000000).required(),
  filename: Joi.string().max(255).required(),
  pagination: {
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20)
  }
};

// Middleware de validation générique
const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate({
      body: req.body,
      query: req.query,
      params: req.params
    }, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      logger.warn('Validation error', {
        path: req.path,
        errors: error.details,
        user: req.user?.id
      });

      return res.status(400).json({
        error: 'Données invalides',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }

    // Remplace les données par les données validées et nettoyées
    req.body = value.body || {};
    req.query = value.query || {};
    req.params = value.params || {};

    next();
  };
};

// Schémas spécifiques aux modules
const authSchemas = {
  register: Joi.object({
    body: Joi.object({
      email: commonValidators.email,
      password: Joi.string().min(8).max(255).required(),
      first_name: Joi.string().max(100).required(),
      last_name: Joi.string().max(100).required(),
      username: Joi.string().alphanum().min(3).max(50).required(),
      phone: commonValidators.phone.optional()
    })
  }),

  login: Joi.object({
    body: Joi.object({
      email: commonValidators.email,
      password: Joi.string().required()
    })
  })
};

const missionSchemas = {
  create: Joi.object({
    body: Joi.object({
      title: Joi.string().min(5).max(255).required(),
      description: Joi.string().min(10).max(5000).required(),
      budget: commonValidators.amount,
      category: Joi.string().max(100).required(),
      deadline: Joi.date().greater('now').required(),
      tags: Joi.array().items(Joi.string().max(50)).max(10).optional()
    })
  }),

  update: Joi.object({
    params: Joi.object({
      id: commonValidators.id
    }),
    body: Joi.object({
      title: Joi.string().min(5).max(255).optional(),
      description: Joi.string().min(10).max(5000).optional(),
      budget: commonValidators.amount.optional(),
      status: Joi.string().valid('draft', 'published', 'cancelled').optional()
    }).min(1)
  })
};

const paymentSchemas = {
  create: Joi.object({
    body: Joi.object({
      amount: commonValidators.amount,
      currency: Joi.string().valid('XOF').default('XOF'),
      description: Joi.string().max(500).required(),
      order_id: commonValidators.id.optional(),
      mission_id: commonValidators.id.optional()
    })
  })
};

// Middleware de validation de fichier
const validateFileUpload = (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({
      error: 'Fichier requis',
      message: 'Aucun fichier téléchargé'
    });
  }

  // Vérification du type MIME
  const allowedMimeTypes = [
    'image/jpeg',
    'image/png', 
    'image/webp',
    'application/pdf',
    'application/zip',
    'text/plain'
  ];

  if (!allowedMimeTypes.includes(req.file.mimetype)) {
    return res.status(400).json({
      error: 'Type de fichier non autorisé',
      allowedTypes: allowedMimeTypes
    });
  }

  // Vérification de la taille
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (req.file.size > maxSize) {
    return res.status(400).json({
      error: 'Fichier trop volumineux',
      maxSize: '10MB',
      actualSize: `${(req.file.size / 1024 / 1024).toFixed(2)}MB`
    });
  }

  next();
};

module.exports = {
  validateRequest,
  validateFileUpload,
  schemas: {
    auth: authSchemas,
    mission: missionSchemas,
    payment: paymentSchemas
  },
  commonValidators
};