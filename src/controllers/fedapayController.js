const paymentService = require('../services/paymentService');
const { Response, Error } = require('../utils/helpers');
const logger = require('../utils/logger');

class FedaPayController {
  
  async handleWebhook(req, res) {
    try {
      const webhookData = req.body;
      
      logger.info('Webhook FedaPay reçu', {
        type: webhookData.type,
        transactionId: webhookData.data?.id
      });

      // Traiter le webhook
      const result = await paymentService.handleWebhook(webhookData);
      
      if (!result.success) {
        logger.error('Erreur traitement webhook FedaPay', {
          error: result.message,
          webhookData
        });
        
        return res.status(400).json(result);
      }

      // Répondre rapidement à FedaPay
      res.status(200).json({ success: true, message: 'Webhook traité' });

    } catch (error) {
      logger.error('Erreur critique traitement webhook FedaPay', {
        error: error.message,
        webhookData: req.body
      });

      // Toujours répondre 200 à FedaPay même en cas d'erreur
      res.status(200).json({ success: false, error: 'Erreur de traitement' });
    }
  }

  async verifyPayment(req, res) {
    try {
      const { transaction_id } = req.params;
      const userId = req.user.id;

      logger.info('Vérification manuelle paiement', { transaction_id, userId });

      const result = await paymentService.verifyPayment(transaction_id);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);

    } catch (error) {
      logger.error('Erreur vérification paiement', {
        userId: req.user.id,
        transaction_id: req.params.transaction_id,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la vérification du paiement'));
    }
  }

  async getPaymentStatus(req, res) {
    try {
      const { transaction_id } = req.params;
      const userId = req.user.id;

      logger.debug('Récupération statut paiement', { transaction_id, userId });

      // Récupérer le paiement depuis la base de données
      const payment = await database.safeSelect(
        'payments',
        { transaction_id: transaction_id },
        { 
          single: true,
          fields: `
            *,
            order:orders(
              *,
              mission:missions(title),
              buyer:users(first_name, last_name)
            )
          `
        }
      );

      if (!payment) {
        return res.status(404).json(Response.error('Paiement non trouvé'));
      }

      // Vérifier les permissions
      if (payment.order.buyer_id !== userId) {
        return res.status(403).json(Response.error('Accès non autorisé'));
      }

      res.json(Response.success(payment, 'Statut paiement récupéré'));

    } catch (error) {
      logger.error('Erreur récupération statut paiement', {
        userId: req.user.id,
        transaction_id: req.params.transaction_id,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la récupération du statut'));
    }
  }
}

module.exports = new FedaPayController();