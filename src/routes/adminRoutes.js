const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware');

// Dashboard admin
router.get('/dashboard',
  authMiddleware.authenticateToken,
  authMiddleware.requireRole([1]),
  adminController.getDashboard
);

// Gestion utilisateurs
router.get('/users',
  authMiddleware.authenticateToken,
  authMiddleware.requireRole([1]),
  adminController.getUsers
);

router.get('/users/:userId',
  authMiddleware.authenticateToken,
  authMiddleware.requireRole([1]),
  adminController.getUserDetails
);

router.put('/users/:userId/status',
  authMiddleware.authenticateToken,
  authMiddleware.requireRole([1]),
  adminController.updateUserStatus
);

// Gestion missions
router.get('/missions',
  authMiddleware.authenticateToken,
  authMiddleware.requireRole([1]),
  adminController.getMissions
);

router.put('/missions/:missionId/status',
  authMiddleware.authenticateToken,
  authMiddleware.requireRole([1]),
  adminController.updateMissionStatus
);

// Gestion commandes
router.get('/orders',
  authMiddleware.authenticateToken,
  authMiddleware.requireRole([1]),
  adminController.getOrders
);

// Gestion paiements
router.get('/payments',
  authMiddleware.authenticateToken,
  authMiddleware.requireRole([1]),
  adminController.getPayments
);

// Gestion retraits
router.get('/withdrawals',
  authMiddleware.authenticateToken,
  authMiddleware.requireRole([1]),
  adminController.getWithdrawals
);

router.put('/withdrawals/:withdrawalId/process',
  authMiddleware.authenticateToken,
  authMiddleware.requireRole([1]),
  adminController.processWithdrawal
);

// Statistiques plateforme
router.get('/platform-stats',
  authMiddleware.authenticateToken,
  authMiddleware.requireRole([1]),
  adminController.getPlatformStats
);

module.exports = router;