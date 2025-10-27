const database = require('../config/database');
const logger = require('../utils/logger');
const { Response, Error, Financial, String } = require('../utils/helpers');
const constants = require('../utils/constants');
const fedapayService = require('./fedapayService');

class PaymentService {
  constructor() {
    this.table = 'payments';
    this.ordersTable = 'orders';
  }

  async initiatePayment(paymentData, userId) {
    const transactionId = `payment_init_${Date.now()}`;
    
    try {
      logger.info(`Initiation paiement: ${transactionId}`, { userId, paymentData });

      const { order_id, amount, description, customer_email, customer_phone } = paymentData;

      // Validation des données
      if (!order_id || !amount) {
        throw new Error('Données de paiement incomplètes');
      }

      // Vérifier que la commande existe
      const order = await database.safeSelect(this.ordersTable, { id: order_id }, { single: true });

      if (!order) {
        throw new Error('Commande non trouvée');
      }

      // Vérifier que l'utilisateur est l'acheteur
      if (order.buyer_id !== userId) {
        throw new Error('Non autorisé à initier le paiement pour cette commande');
      }

      // Vérifier que la commande est en attente de paiement
      if (order.status !== constants.ORDER_STATUS.PENDING) {
        throw new Error('Cette commande ne peut pas être payée');
      }

      // Vérifier que le montant correspond
      if (order.amount !== amount) {
        throw new Error('Le montant ne correspond pas à celui de la commande');
      }

      // Préparer les données client pour FedaPay
      const customerData = {
        first_name: order.buyer?.first_name || 'Client',
        last_name: order.buyer?.last_name || 'Digital Market',
        email: customer_email || order.buyer?.email,
        phone_number: customer_phone
      };

      // Créer la transaction FedaPay
      const fedapayTransaction = await fedapayService.createTransaction(
        amount,
        description || `Paiement pour commande ${order_id}`,
        customerData
      );

      // Enregistrer le paiement en base
      const payment = {
        order_id: order_id,
        transaction_id: fedapayTransaction.id,
        amount: Financial.formatAmount(amount),
        currency: constants.FEDAPAY.CURRENCY,
        description: description || `Paiement pour commande ${order_id}`,
        status: constants.PAYMENT_STATUS.PENDING,
        payment_method: 'fedapay',
        customer_email: customer_email,
        customer_phone: customer_phone,
        fedapay_data: fedapayTransaction,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const paymentRecord = await database.safeInsert(this.table, payment);

      logger.info(`Paiement initié avec succès: ${transactionId}`, {
        paymentId: paymentRecord.id,
        orderId: order_id,
        transactionId: fedapayTransaction.id,
        amount: amount
      });

      return Response.success({
        payment: paymentRecord,
        payment_url: fedapayTransaction.url, // URL de paiement FedaPay
        transaction_id: fedapayTransaction.id
      }, 'Paiement initié avec succès');

    } catch (err) {
      const handledError = Error.handleServiceError(err, 'PaymentService.initiatePayment', {
        transactionId,
        userId,
        paymentData
      });
      
      logger.error(`Échec initiation paiement: ${transactionId}`, {
        error: handledError.message
      });
      
      return Response.error(handledError.message);
    }
  }

  async verifyPayment(transactionId) {
    const verificationId = `payment_verify_${transactionId}_${Date.now()}`;
    
    try {
      logger.info(`Vérification paiement: ${verificationId}`, { transactionId });

      // Vérifier le statut avec FedaPay
      const fedapayTransaction = await fedapayService.verifyTransaction(transactionId);

      // Récupérer le paiement correspondant
      const payment = await database.safeSelect(
        this.table, 
        { transaction_id: transactionId }, 
        { single: true }
      );

      if (!payment) {
        throw new Error('Paiement non trouvé');
      }

      const newStatus = this.mapFedaPayStatus(fedapayTransaction.status);
      const updates = {
        status: newStatus,
        fedapay_data: fedapayTransaction,
        updated_at: new Date().toISOString()
      };

      // Si le paiement est complété, mettre à jour la commande
      if (newStatus === constants.PAYMENT_STATUS.COMPLETED) {
        updates.completed_at = new Date().toISOString();
        
        // Mettre à jour le statut de la commande
        await database.safeUpdate(
          this.ordersTable,
          { 
            status: constants.ORDER_STATUS.PAID,
            paid_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          { id: payment.order_id }
        );

        logger.info(`Paiement complété: ${verificationId}`, {
          paymentId: payment.id,
          orderId: payment.order_id,
          amount: payment.amount
        });
      }

      const updatedPayment = await database.safeUpdate(
        this.table, 
        updates, 
        { transaction_id: transactionId }
      );

      return Response.success(updatedPayment, 'Statut du paiement vérifié');

    } catch (err) {
      const handledError = Error.handleServiceError(err, 'PaymentService.verifyPayment', {
        verificationId,
        transactionId
      });
      
      logger.error(`Échec vérification paiement: ${verificationId}`, {
        error: handledError.message
      });
      
      return Response.error(handledError.message);
    }
  }

  async handleWebhook(webhookData) {
    const webhookId = `webhook_${String.generateRandomString(8)}_${Date.now()}`;
    
    try {
      logger.info(`Traitement webhook: ${webhookId}`, { 
        type: webhookData.type,
        transactionId: webhookData.data?.id 
      });

      // Vérifier la signature du webhook (à implémenter selon FedaPay)
      if (!this.verifyWebhookSignature(webhookData)) {
        throw new Error('Signature webhook invalide');
      }

      const { type, data } = webhookData;

      if (type === 'transaction.approved') {
        return await this.verifyPayment(data.id);
      }

      logger.warn(`Type de webhook non géré: ${type}`, { webhookId });

      return Response.success(null, 'Webhook reçu mais non traité');

    } catch (err) {
      const handledError = Error.handleServiceError(err, 'PaymentService.handleWebhook', {
        webhookId,
        webhookData
      });
      
      logger.error(`Échec traitement webhook: ${webhookId}`, {
        error: handledError.message
      });
      
      return Response.error(handledError.message);
    }
  }

  async getUserPayments(userId, filters = {}) {
    try {
      const { 
        page = 1, 
        limit = constants.LIMITS.DEFAULT_PAGE_LIMIT, 
        status 
      } = filters;

      const offset = (page - 1) * limit;

      // Récupérer les paiements via les commandes de l'utilisateur
      let query = database.client
        .from(this.table)
        .select(`
          *,
          order:orders(
            *,
            mission:missions(title),
            buyer:users(first_name, last_name),
            seller:users(first_name, last_name)
          )
        `, { count: 'exact' })
        .in('order.buyer_id', [userId])
        .order('created_at', { ascending: false });

      if (status && status !== 'all') {
        query = query.eq('status', status);
      }

      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      const pagination = {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count
      };

      return Response.paginated(data, pagination, 'Paiements récupérés avec succès');

    } catch (err) {
      const handledError = Error.handleServiceError(err, 'PaymentService.getUserPayments', {
        userId,
        filters
      });
      
      return Response.error(handledError.message);
    }
  }

  async getPaymentById(paymentId, userId) {
    try {
      logger.debug(`Récupération paiement: ${paymentId}`, { userId });

      const payment = await database.safeSelect(
        this.table,
        { id: paymentId },
        { 
          single: true,
          fields: `
            *,
            order:orders(
              *,
              mission:missions(title),
              buyer:users(first_name, last_name),
              seller:users(first_name, last_name)
            )
          `
        }
      );

      if (!payment) {
        throw new Error('Paiement non trouvé');
      }

      // Vérifier les permissions
      if (payment.order.buyer_id !== userId) {
        throw new Error('Accès non autorisé à ce paiement');
      }

      return Response.success(payment, 'Paiement récupéré avec succès');

    } catch (err) {
      const handledError = Error.handleServiceError(err, 'PaymentService.getPaymentById', {
        paymentId,
        userId
      });
      
      return Response.error(handledError.message);
    }
  }

  // Méthodes helper internes
  mapFedaPayStatus(fedapayStatus) {
    const statusMap = {
      'pending': constants.PAYMENT_STATUS.PENDING,
      'approved': constants.PAYMENT_STATUS.COMPLETED,
      'canceled': constants.PAYMENT_STATUS.CANCELLED,
      'declined': constants.PAYMENT_STATUS.FAILED
    };

    return statusMap[fedapayStatus] || constants.PAYMENT_STATUS.PENDING;
  }

  verifyWebhookSignature(webhookData) {
    // Implémenter la vérification de signature FedaPay
    // Cette méthode doit vérifier que le webhook provient bien de FedaPay
    // en utilisant la clé secrète de webhook
    
    // Pour l'instant, retourner true en développement
    if (process.env.NODE_ENV === 'development') {
      return true;
    }

    // TODO: Implémenter la vérification de signature en production
    logger.warn('Vérification de signature webhook non implémentée');
    return true;
  }

  async processRefund(paymentId, userId, reason) {
    const refundId = `refund_${paymentId}_${Date.now()}`;
    
    try {
      logger.info(`Traitement remboursement: ${refundId}`, { paymentId, userId, reason });

      // Récupérer le paiement
      const payment = await database.safeSelect(
        this.table, 
        { id: paymentId }, 
        { single: true }
      );

      if (!payment) {
        throw new Error('Paiement non trouvé');
      }

      // Vérifier les permissions (admin ou acheteur)
      const order = await database.safeSelect(
        this.ordersTable, 
        { id: payment.order_id }, 
        { single: true }
      );

      if (order.buyer_id !== userId) {
        throw new Error('Non autorisé à initier un remboursement pour ce paiement');
      }

      // Vérifier que le paiement est complété
      if (payment.status !== constants.PAYMENT_STATUS.COMPLETED) {
        throw new Error('Seuls les paiements complétés peuvent être remboursés');
      }

      // Vérifier que la commande peut être remboursée
      if (!['pending', 'paid', 'cancelled'].includes(order.status)) {
        throw new Error('Cette commande ne peut pas être remboursée');
      }

      // Initier le remboursement avec FedaPay
      const refund = await fedapayService.createRefund(
        payment.transaction_id,
        payment.amount,
        reason
      );

      // Mettre à jour le statut du paiement
      const updatedPayment = await database.safeUpdate(
        this.table,
        {
          status: constants.PAYMENT_STATUS.REFUNDED,
          refund_data: refund,
          refund_reason: reason,
          refunded_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        { id: paymentId }
      );

      logger.info(`Remboursement initié: ${refundId}`, {
        paymentId,
        orderId: payment.order_id,
        amount: payment.amount,
        reason
      });

      return Response.success(updatedPayment, 'Remboursement initié avec succès');

    } catch (err) {
      const handledError = Error.handleServiceError(err, 'PaymentService.processRefund', {
        refundId,
        paymentId,
        userId,
        reason
      });
      
      logger.error(`Échec remboursement: ${refundId}`, {
        error: handledError.message
      });
      
      return Response.error(handledError.message);
    }
  }
}

module.exports = new PaymentService();