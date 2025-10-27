const Joi = require('joi');
const logger = require('../utils/logger');

// Validateurs communs réutilisables
const commonValidators = {
  id: Joi.string().uuid().required().messages({
    'string.guid': 'ID invalide',
    'any.required': 'ID requis'
  }),
  
  email: Joi.string().email().max(255).required().messages({
    'string.email': 'Email invalide',
    'any.required': 'Email requis'
  }),
  
  phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional().messages({
    'string.pattern.base': 'Numéro de téléphone invalide'
  }),
  
  amount: Joi.number().integer().min(100).max(1000000).required().messages({
    'number.min': 'Le montant minimum est de 100 FCFA',
    'number.max': 'Le montant maximum est de 1,000,000 FCFA',
    'any.required': 'Montant requis'
  }),
  
  password: Joi.string().min(8).max(255)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      'string.min': 'Le mot de passe doit contenir au moins 8 caractères',
      'string.pattern.base': 'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre'
    })
};

// Middleware de validation principal
const validateRequest = (schema) => {
  return (req, res, next) => {
    const validationOptions = {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true
    };

    const { error, value } = schema.validate({
      body: req.body,
      query: req.query,
      params: req.params,
      files: req.files
    }, validationOptions);

    if (error) {
      logger.warn('Erreur de validation', {
        path: req.path,
        method: req.method,
        ip: req.ip,
        errors: error.details,
        user: req.user?.id
      });

      const errorDetails = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type
      }));

      return res.status(400).json({
        success: false,
        error: 'Données de requête invalides',
        details: errorDetails,
        timestamp: new Date().toISOString()
      });
    }

    // Remplacer les données par les données validées
    req.body = value.body || {};
    req.query = value.query || {};
    req.params = value.params || {};
    req.files = value.files || {};

    next();
  };
};

// Schémas de validation spécifiques
const authSchemas = {
  register: Joi.object({
    body: Joi.object({
      email: commonValidators.email,
      password: commonValidators.password,
      first_name: Joi.string().min(2).max(100).required().messages({
        'string.min': 'Le prénom doit contenir au moins 2 caractères',
        'any.required': 'Prénom requis'
      }),
      last_name: Joi.string().min(2).max(100).required().messages({
        'string.min': 'Le nom doit contenir au moins 2 caractères',
        'any.required': 'Nom requis'
      }),
      username: Joi.string().alphanum().min(3).max(50).required().messages({
        'string.alphanum': 'Le nom d\'utilisateur ne doit contenir que des caractères alphanumériques',
        'string.min': 'Le nom d\'utilisateur doit contenir au moins 3 caractères'
      }),
      phone: commonValidators.phone,
      role_id: Joi.number().integer().valid(2, 3, 4).default(2).messages({
        'any.only': 'Rôle invalide'
      })
    })
  }),

  login: Joi.object({
    body: Joi.object({
      email: commonValidators.email,
      password: Joi.string().required().messages({
        'any.required': 'Mot de passe requis'
      })
    })
  }),

  updateProfile: Joi.object({
    body: Joi.object({
      first_name: Joi.string().min(2).max(100).optional(),
      last_name: Joi.string().min(2).max(100).optional(),
      username: Joi.string().alphanum().min(3).max(50).optional(),
      phone: commonValidators.phone,
      profile_data: Joi.object().optional()
    }).min(1)
  })
};

const missionSchemas = {
  create: Joi.object({
    body: Joi.object({
      title: Joi.string().min(5).max(255).required().messages({
        'string.min': 'Le titre doit contenir au moins 5 caractères',
        'any.required': 'Titre requis'
      }),
      description: Joi.string().min(10).max(5000).required().messages({
        'string.min': 'La description doit contenir au moins 10 caractères'
      }),
      budget: commonValidators.amount,
      category: Joi.string().max(100).required(),
      deadline: Joi.date().iso().greater('now').required().messages({
        'date.greater': 'La date limite doit être dans le futur'
      }),
      tags: Joi.array().items(Joi.string().max(50)).max(10).optional(),
      attachments: Joi.array().optional()
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
      category: Joi.string().max(100).optional(),
      deadline: Joi.date().iso().greater('now').optional(),
      status: Joi.string().valid('draft', 'published', 'cancelled').optional(),
      tags: Joi.array().items(Joi.string().max(50)).max(10).optional()
    }).min(1)
  }),

  apply: Joi.object({
    params: Joi.object({
      id: commonValidators.id
    }),
    body: Joi.object({
      proposal: Joi.string().min(10).max(2000).required().messages({
        'string.min': 'La proposition doit contenir au moins 10 caractères'
      }),
      bid_amount: commonValidators.amount,
      delivery_time: Joi.number().integer().min(1).max(365).required().messages({
        'number.min': 'Le délai de livraison doit être d\'au moins 1 jour'
      })
    })
  })
};

const productSchemas = {
  create: Joi.object({
    body: Joi.object({
      title: Joi.string().min(5).max(255).required(),
      description: Joi.string().min(10).max(5000).required(),
      price: commonValidators.amount,
      category: Joi.string().max(100).required(),
      tags: Joi.array().items(Joi.string().max(50)).max(10).optional(),
      is_digital: Joi.boolean().default(true),
      file_url: Joi.string().uri().optional(),
      image_url: Joi.string().uri().optional()
    })
  }),

  update: Joi.object({
    params: Joi.object({
      id: commonValidators.id
    }),
    body: Joi.object({
      title: Joi.string().min(5).max(255).optional(),
      description: Joi.string().min(10).max(5000).optional(),
      price: commonValidators.amount.optional(),
      category: Joi.string().max(100).optional(),
      tags: Joi.array().items(Joi.string().max(50)).max(10).optional(),
      status: Joi.string().valid('active', 'inactive').optional(),
      file_url: Joi.string().uri().optional(),
      image_url: Joi.string().uri().optional()
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
      mission_id: commonValidators.id.optional(),
      product_id: commonValidators.id.optional()
    })
  })
};

// Validation de fichiers
const validateFileUpload = (allowedTypes, maxSize = 10 * 1024 * 1024) => {
  return (req, res, next) => {
    if (!req.file && !req.files) {
      return res.status(400).json({
        success: false,
        error: 'Fichier requis',
        message: 'Aucun fichier téléchargé'
      });
    }

    const files = req.file ? [req.file] : (req.files ? Object.values(req.files).flat() : []);

    for (const file of files) {
      // Validation du type MIME
      if (!allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({
          success: false,
          error: 'Type de fichier non autorisé',
          allowedTypes,
          actualType: file.mimetype
        });
      }

      // Validation de la taille
      if (file.size > maxSize) {
        return res.status(400).json({
          success: false,
          error: 'Fichier trop volumineux',
          maxSize: `${maxSize / 1024 / 1024}MB`,
          actualSize: `${(file.size / 1024 / 1024).toFixed(2)}MB`
        });
      }

      // Validation du nom de fichier
      if (file.originalname.length > 255) {
        return res.status(400).json({
          success: false,
          error: 'Nom de fichier trop long',
          maxLength: 255
        });
      }
    }

    next();
  };
};

module.exports = {
  validateRequest,
  validateFileUpload,
  schemas: {
    auth: authSchemas,
    mission: missionSchemas,
    product: productSchemas,
    payment: paymentSchemas
  },
  commonValidators
};