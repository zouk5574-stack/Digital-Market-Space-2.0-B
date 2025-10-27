const express = require('express');
const router = express.Router();
const logController = require('../controllers/logController');
const authMiddleware = require('../middleware/authMiddleware');

// Logs système (admin seulement)
router.get('/system',
  authMiddleware.authenticateToken,
  authMiddleware.requireRole([1]),
  logController.getSystemLogs
);

// Logs audit (admin seulement)
router.get('/audit',
  authMiddleware.authenticateToken,
  authMiddleware.requireRole([1]),
  logController.getAuditLogs
);

// Logs activité utilisateur (admin seulement)
router.get('/user/:userId/activity',
  authMiddleware.authenticateToken,
  authMiddleware.requireRole([1]),
  logController.getUserActivityLogs
);

// Export logs (admin seulement)
router.get('/export',
  authMiddleware.authenticateToken,
  authMiddleware.requireRole([1]),
  logController.exportLogs
);

module.exports = router;