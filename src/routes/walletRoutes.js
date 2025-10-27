const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const authMiddleware = require('../middleware/authMiddleware');

// Portefeuille utilisateur
router.get('/',
  authMiddleware.authenticateToken,
  walletController.getUserWallet
);

// Historique des transactions
router.get('/transactions',
  authMiddleware.authenticateToken,
  walletController.getTransactionHistory
);

// Statistiques portefeuille
router.get('/stats',
  authMiddleware.authenticateToken,
  walletController.getWalletStats
);

module.exports = router;