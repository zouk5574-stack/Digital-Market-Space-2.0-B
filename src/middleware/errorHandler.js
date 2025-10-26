// src/middleware/errorHandler.js
const errorHandler = (err, req, res, next) => {
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Erreur de validation Joi
  if (err.isJoi) {
    return res.status(400).json({
      error: 'Validation Error',
      details: err.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }))
    });
  }

  // Erreur Supabase
  if (err.code) {
    switch (err.code) {
      case 'PGRST116':
        return res.status(404).json({ error: 'Resource not found' });
      case '23505':
        return res.status(409).json({ error: 'Duplicate resource' });
      case '23503':
        return res.status(400).json({ error: 'Invalid reference' });
      default:
        return res.status(500).json({ error: 'Database error' });
    }
  }

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
};

const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.url}`
  });
};

module.exports = { errorHandler, notFoundHandler };
