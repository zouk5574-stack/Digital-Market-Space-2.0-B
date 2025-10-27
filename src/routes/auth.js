const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { validateRequest } = require('../middleware/validationMiddleware');
const { schemas } = require('../middleware/validationMiddleware');
const authMiddleware = require('../middleware/authMiddleware');
const rateLimit = require('express-rate-limit');

// Rate limiting spécifique pour l'authentification
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 tentatives max par windowMs
  message: {
    success: false,
    error: 'Trop de tentatives de connexion',
    message: 'Veuillez réessayer dans 15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true
});

const strictAuthLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 5, // 5 tentatives max par heure
  message: {
    success: false,
    error: 'Trop de tentatives',
    message: 'Veuillez réessayer dans 1 heure ou contactez le support'
  }
});

// Routes publiques
router.post(
  '/register',
  authLimiter,
  validateRequest(schemas.auth.register),
  authController.register
);

router.post(
  '/login',
  authLimiter,
  validateRequest(schemas.auth.login),
  authController.login
);

router.post(
  '/refresh-token',
  authLimiter,
  authController.refreshToken
);

router.post(
  '/forgot-password',
  strictAuthLimiter,
  authController.forgotPassword
);

router.post(
  '/reset-password',
  strictAuthLimiter,
  authController.resetPassword
);

router.post(
  '/verify-email',
  authLimiter,
  authController.verifyEmail
);

// Routes protégées
router.get(
  '/me',
  authMiddleware.authenticateToken,
  authController.getCurrentUser
);

router.put(
  '/profile',
  authMiddleware.authenticateToken,
  validateRequest(schemas.auth.updateProfile),
  authController.updateProfile
);

router.post(
  '/logout',
  authMiddleware.authenticateToken,
  authController.logout
);

router.put(
  '/change-password',
  authMiddleware.authenticateToken,
  strictAuthLimiter,
  authController.changePassword
);

router.post(
  '/resend-verification',
  authMiddleware.authenticateToken,
  authLimiter,
  authController.resendVerification
);

// Routes admin (protégées par rôle)
router.get(
  '/admin/users',
  authMiddleware.authenticateToken,
  authMiddleware.requireRole([1]), // Admin seulement
  authController.getUsersList
);

router.put(
  '/admin/users/:id/status',
  authMiddleware.authenticateToken,
  authMiddleware.requireRole([1]),
  authController.updateUserStatus
);

module.exports = router;