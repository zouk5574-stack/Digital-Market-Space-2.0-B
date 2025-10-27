const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentProviderController');
const { validateRequest } = require('../middleware/validationMiddleware');
const { schemas } = require('../middleware/validationMiddleware');
const authMiddleware = require('../middleware/authMiddleware');

// Initiation des paiements
router.post('/initiate',
  authMiddleware.authenticateToken,
  validateRequest(schemas.payment.create),
  paymentController.initiatePayment
);

// Vérification des paiements
router.get('/:transactionId/status',
  authMiddleware.authenticateToken,
  paymentController.getPaymentStatus
);

// Remboursements
router.post('/:paymentId/refund',
  authMiddleware.authenticateToken,
  paymentController.processRefund
);

// Méthodes de paiement disponibles
router.get('/methods',
  authMiddleware.authenticateToken,
  paymentController.getPaymentMethods
);

// Historique des paiements utilisateur
router.get('/user/history',
  authMiddleware.authenticateToken,
  paymentController.getUserPayments
);

module.exports = router;