const paymentService = require('../services/paymentService');
const { Response, Error } = require('../utils/helpers');
const logger = require('../utils/logger');

class PaymentProviderController {
  
  async initiatePayment(req, res) {
    try {
      const paymentData = req.body;
      const userId = req.user.id;

      logger.info('Initiation paiement via provider', { userId, paymentData });

      const result = await paymentService.initiatePayment(paymentData, userId);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.status(201).json(result);

    } catch (error) {
      logger.error('Erreur initiation paiement provider', {
        userId: req.user.id,
        error: error.message,
        paymentData: req.body
      });

      res.status(500).json(Response.error('Erreur lors de l\'initiation du paiement'));
    }
  }

  async processRefund(req, res) {
    try {
      const { paymentId } = req.params;
      const { reason } = req.body;
      const userId = req.user.id;

      logger.info('Demande remboursement', { paymentId, userId, reason });

      const result = await paymentService.processRefund(paymentId, userId, reason);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);

    } catch (error) {
      logger.error('Erreur traitement remboursement', {
        userId: req.user.id,
        paymentId: req.params.paymentId,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors du traitement du remboursement'));
    }
  }

  async getPaymentMethods(req, res) {
    try {
      const userId = req.user.id;

      logger.debug('Récupération méthodes paiement', { userId });

      const paymentMethods = [
        {
          id: 'fedapay',
          name: 'FedaPay',
          description: 'Paiement mobile via FedaPay',
          supported_currencies: ['XOF'],
          fees: { percentage: 1.5, fixed: 0 },
          is_active: true
        },
        {
          id: 'wallet',
          name: 'Portefeuille Digital',
          description: 'Paiement avec le solde du portefeuille',
          supported_currencies: ['XOF'],
          fees: { percentage: 0, fixed: 0 },
          is_active: true
        }
      ];

      res.json(Response.success(paymentMethods, 'Méthodes de paiement récupérées'));

    } catch (error) {
      logger.error('Erreur récupération méthodes paiement', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la récupération des méthodes de paiement'));
    }
  }
}

module.exports = new PaymentProviderController();