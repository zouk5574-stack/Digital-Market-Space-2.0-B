import Joi from 'joi';

// Schémas de validation communs
export const uuidSchema = Joi.string().uuid().required();
export const emailSchema = Joi.string().email().max(255).required();
export const phoneSchema = Joi.string().pattern(/^\+?[\d\s-]{10,}$/).optional();

// Validation Mission
export const missionSchema = Joi.object({
  title: Joi.string().min(5).max(255).required()
    .messages({
      'string.empty': 'Le titre est obligatoire',
      'string.min': 'Le titre doit contenir au moins 5 caractères',
      'string.max': 'Le titre ne peut pas dépasser 255 caractères'
    }),
  description: Joi.string().min(10).max(5000).required()
    .messages({
      'string.empty': 'La description est obligatoire',
      'string.min': 'La description doit contenir au moins 10 caractères',
      'string.max': 'La description ne peut pas dépasser 5000 caractères'
    }),
  budget: Joi.number().min(0).max(1000000).required()
    .messages({
      'number.min': 'Le budget ne peut pas être négatif',
      'number.max': 'Le budget ne peut pas dépasser 1,000,000'
    }),
  category: Joi.string().valid(
    'design', 'development', 'marketing', 'writing', 'translation', 'support'
  ).required(),
  deadline: Joi.date().min('now').required()
    .messages({
      'date.min': 'La date limite doit être dans le futur'
    }),
  tags: Joi.array().items(Joi.string().max(50)).max(10).optional()
});

// Validation Utilisateur
export const userUpdateSchema = Joi.object({
  first_name: Joi.string().min(1).max(100).optional()
    .trim()
    .pattern(/^[a-zA-ZÀ-ÿ\s'-]+$/)
    .messages({
      'string.pattern.base': 'Le prénom contient des caractères invalides'
    }),
  last_name: Joi.string().min(1).max(100).optional()
    .trim()
    .pattern(/^[a-zA-ZÀ-ÿ\s'-]+$/),
  username: Joi.string().alphanum().min(3).max(50).optional()
    .messages({
      'string.alphanum': 'Le username ne peut contenir que des lettres et chiffres'
    }),
  phone: phoneSchema,
  profile_data: Joi.object().optional()
});

// Validation Commande
export const orderSchema = Joi.object({
  mission_id: uuidSchema,
  buyer_id: uuidSchema,
  freelancer_id: uuidSchema,
  amount: Joi.number().min(0).max(1000000).required(),
  description: Joi.string().min(10).max(2000).optional(),
  deadline: Joi.date().min('now').required()
});

// Validation Paiement
export const paymentSchema = Joi.object({
  order_id: uuidSchema,
  amount: Joi.number().min(100).max(1000000).required(), // Minimum 100 unités
  payment_method: Joi.string().valid('card', 'mobile_money', 'wallet').required(),
  provider_data: Joi.object().optional()
});

// Validation Retrait
export const withdrawalSchema = Joi.object({
  amount: Joi.number().min(1000).max(500000).required(), // Minimum 1000 unités
  payment_method: Joi.string().valid('bank_transfer', 'mobile_money').required(),
  account_details: Joi.object({
    bank_name: Joi.string().when('payment_method', {
      is: 'bank_transfer',
      then: Joi.string().required(),
      otherwise: Joi.string().optional()
    }),
    account_number: Joi.string().required(),
    account_name: Joi.string().required()
  }).required()
});

// Middleware de validation générique
export const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true
    });
    
    if (error) {
      const errorMessages = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      return next(new AppError(`Erreur de validation: ${JSON.stringify(errorMessages)}`, 400));
    }
    
    req.validatedData = value;
    next();
  };
};