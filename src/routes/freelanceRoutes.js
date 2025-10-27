const express = require('express');
const router = express.Router();
const freelanceController = require('../controllers/freelanceController');
const authMiddleware = require('../middleware/authMiddleware');

// Profil freelance
router.get('/profile/:id',
  freelanceController.getFreelancerProfile
);

router.put('/profile',
  authMiddleware.authenticateToken,
  freelanceController.updateFreelancerProfile
);

// Statistiques freelance
router.get('/stats',
  authMiddleware.authenticateToken,
  freelanceController.getFreelancerStats
);

// Commandes freelance
router.post('/orders',
  authMiddleware.authenticateToken,
  freelanceController.createOrder
);

router.put('/orders/:orderId/start',
  authMiddleware.authenticateToken,
  freelanceController.startOrder
);

router.put('/orders/:orderId/deliver',
  authMiddleware.authenticateToken,
  freelanceController.submitDelivery
);

router.put('/orders/:orderId/approve',
  authMiddleware.authenticateToken,
  freelanceController.approveDelivery
);

router.put('/orders/:orderId/revision',
  authMiddleware.authenticateToken,
  freelanceController.requestRevision
);

module.exports = router;