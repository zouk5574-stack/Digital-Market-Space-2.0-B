const express = require('express');
const router = express.Router();
const withdrawalController = require('../controllers/withdrawalController');
const authMiddleware = require('../middleware/authMiddleware');

// Demandes de retrait
router.post('/',
  authMiddleware.authenticateToken,
  withdrawalController.createWithdrawal
);

// Historique des retraits
router.get('/',
  authMiddleware.authenticateToken,
  withdrawalController.getUserWithdrawals
);

// Annulation de retrait
router.delete('/:withdrawalId',
  authMiddleware.authenticateToken,
  withdrawalController.cancelWithdrawal
);

// Statistiques retraits
router.get('/stats',
  authMiddleware.authenticateToken,
  withdrawalController.getWithdrawalStats
);

module.exports = router;