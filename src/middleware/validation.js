// src/middleware/validation.js
const Joi = require('joi');

// Schémas de validation
const productSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  price: Joi.number().min(0).precision(2).required(),
  description: Joi.string().max(1000).optional(),
  category_id: Joi.string().uuid().required(),
  shop_id: Joi.string().uuid().required(),
  stock_quantity: Joi.number().integer().min(0).optional(),
  is_active: Joi.boolean().optional()
});

const orderSchema = Joi.object({
  user_id: Joi.string().uuid().required(),
  total_amount: Joi.number().min(0).precision(2).required(),
  status: Joi.string().valid('pending', 'confirmed', 'shipped', 'delivered', 'cancelled').required(),
  shipping_address: Joi.string().max(500).required()
});

const shopSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(1000).optional(),
  user_id: Joi.string().uuid().required(),
  is_active: Joi.boolean().optional()
});

const userSchema = Joi.object({
  username: Joi.string().min(3).max(50).required(),
  email: Joi.string().email().required(),
  first_name: Joi.string().max(100).optional(),
  last_name: Joi.string().max(100).optional(),
  phone: Joi.string().pattern(/^\+?[\d\s-]{10,}$/).optional()
});

// Middleware de validation
const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }
    next();
  };
};

module.exports = {
  productSchema,
  orderSchema,
  shopSchema,
  userSchema,
  validateRequest
};
