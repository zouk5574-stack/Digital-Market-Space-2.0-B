const express = require('express');
const router = express.Router();
const statsController = require('../controllers/statsController');
const authMiddleware = require('../middleware/authMiddleware');

// Statistiques plateforme (admin seulement)
router.get('/platform',
  authMiddleware.authenticateToken,
  authMiddleware.requireRole([1]),
  statsController.getPlatformStats
);

// Statistiques utilisateur
router.get('/user',
  authMiddleware.authenticateToken,
  statsController.getUserStats
);

// Statistiques revenus
router.get('/revenue',
  authMiddleware.authenticateToken,
  statsController.getRevenueStats
);

// Statistiques missions
router.get('/missions',
  authMiddleware.authenticateToken,
  statsController.getMissionStats
);

module.exports = router;