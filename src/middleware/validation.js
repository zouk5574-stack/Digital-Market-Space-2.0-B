// src/middleware/validation.js
import Joi from 'joi';

// Schémas de validation pour toutes les tables
export const productSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  price: Joi.number().min(0).precision(2).required(),
  description: Joi.string().max(2000).optional().allow(''),
  category_id: Joi.string().uuid().required(),
  shop_id: Joi.string().uuid().required(),
  stock_quantity: Joi.number().integer().min(0).default(0),
  is_active: Joi.boolean().default(true),
  tags: Joi.array().items(Joi.string()).optional()
});

export const orderSchema = Joi.object({
  user_id: Joi.string().uuid().required(),
  total_amount: Joi.number().min(0).precision(2).required(),
  status: Joi.string().valid('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled').required(),
  shipping_address: Joi.object({
    street: Joi.string().required(),
    city: Joi.string().required(),
    country: Joi.string().required(),
    postal_code: Joi.string().required()
  }).required(),
  items: Joi.array().items(Joi.object({
    product_id: Joi.string().uuid().required(),
    quantity: Joi.number().integer().min(1).required(),
    unit_price: Joi.number().min(0).precision(2).required()
  })).min(1).required()
});

export const shopSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(1000).optional().allow(''),
  user_id: Joi.string().uuid().required(),
  contact_email: Joi.string().email().optional().allow(''),
  contact_phone: Joi.string().pattern(/^\+?[\d\s-]{10,}$/).optional().allow(''),
  is_active: Joi.boolean().default(true)
});

export const userSchema = Joi.object({
  username: Joi.string().min(3).max(50).required(),
  email: Joi.string().email().required(),
  first_name: Joi.string().max(100).optional().allow(''),
  last_name: Joi.string().max(100).optional().allow(''),
  phone: Joi.string().pattern(/^\+?[\d\s-]{10,}$/).optional().allow(''),
  avatar_url: Joi.string().uri().optional().allow('')
});

export const freelanceMissionSchema = Joi.object({
  title: Joi.string().min(1).max(255).required(),
  description: Joi.string().min(10).required(),
  budget: Joi.number().min(0).precision(2).required(),
  client_id: Joi.string().uuid().required(),
  deadline: Joi.date().greater('now').required(),
  category_id: Joi.string().uuid().required(),
  skills_required: Joi.array().items(Joi.string()).optional(),
  status: Joi.string().valid('draft', 'published', 'in_progress', 'completed', 'cancelled').default('draft')
});

export const walletSchema = Joi.object({
  user_id: Joi.string().uuid().required(),
  balance: Joi.number().min(0).precision(2).default(0),
  currency: Joi.string().length(3).default('XOF')
});

export const withdrawalSchema = Joi.object({
  user_id: Joi.string().uuid().required(),
  amount: Joi.number().min(0.01).precision(2).required(),
  payment_method: Joi.string().valid('bank_transfer', 'mobile_money', 'paypal').required(),
  status: Joi.string().valid('pending', 'processing', 'completed', 'failed').default('pending')
});

// Middleware de validation
export const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { 
      abortEarly: false,
      stripUnknown: true,
      allowUnknown: true
    });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type
      }));
      
      return res.status(400).json({ 
        success: false,
        error: 'Validation failed',
        details: errors 
      });
    }
    
    req.body = value;
    next();
  };
};

// Validation des paramètres UUID
export const validateUUID = (paramName) => {
  return (req, res, next) => {
    const uuid = req.params[paramName];
    const uuidSchema = Joi.string().uuid().required();
    
    const { error } = uuidSchema.validate(uuid);
    
    if (error) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid parameter',
        message: `${paramName} must be a valid UUID`
      });
    }
    
    next();
  };
};
