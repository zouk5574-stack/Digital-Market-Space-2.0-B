// src/middleware/validation.js
import Joi from 'joi';

export const productSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  price: Joi.number().min(0).precision(2).required(),
  description: Joi.string().max(2000).optional(),
  category_id: Joi.string().uuid().required(),
  shop_id: Joi.string().uuid().required(),
  stock_quantity: Joi.number().integer().min(0).default(0),
  is_active: Joi.boolean().default(true)
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
  }).required()
});

export const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { 
      abortEarly: false,
      stripUnknown: true
    });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors 
      });
    }
    
    req.body = value;
    next();
  };
};
