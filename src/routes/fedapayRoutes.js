const express = require('express');
const router = express.Router();
const fedapayController = require('../controllers/fedapayController');

// Webhook FedaPay (pas d'authentification standard)
router.post('/webhook',
  fedapayController.handleWebhook
);

// Vérification manuelle des paiements
router.get('/:transaction_id/verify',
  fedapayController.verifyPayment
);

module.exports = router;