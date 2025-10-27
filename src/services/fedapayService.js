import axios from 'axios';
import { supabase } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { log } from '../utils/logger.js';

export class FedapayService {
  constructor() {
    this.apiKey = process.env.FEDAPAY_API_KEY;
    this.baseURL = process.env.FEDAPAY_BASE_URL || 'https://api.fedapay.com/v1';
    this.currency = 'XOF';
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }

  // Initialisation de paiement
  async initializePayment(paymentData) {
    try {
      const { amount, description, customer, callback_url, metadata } = paymentData;

      // Validation du montant
      if (amount < 100) {
        throw new AppError('Le montant minimum est de 100 FCFA', 400);
      }

      if (amount > 1000000) {
        throw new AppError('Le montant maximum est de 1,000,000 FCFA', 400);
      }

      const payload = {
        amount: Math.round(amount), // FedaPay nécessite des entiers
        currency: this.currency,
        description: description || 'Paiement Digital Market Space',
        customer: {
          email: customer.email,
          firstname: customer.first_name,
          lastname: customer.last_name,
          phone_number: customer.phone
        },
        callback_url: callback_url || `${process.env.BACKEND_URL}/api/payments/webhook`,
        metadata: {
          ...metadata,
          platform: 'digital-market-space',
          version: '2.0'
        }
      };

      const response = await this.client.post('/transactions', payload);

      if (!response.data || !response.data.transaction) {
        throw new AppError('Réponse invalide de FedaPay', 500);
      }

      const transaction = response.data.transaction;

      // Log de la transaction
      await this.logTransaction({
        transaction_id: transaction.id,
        amount: transaction.amount,
        currency: transaction.currency,
        status: transaction.status,
        fedapay_reference: transaction.reference,
        customer_email: customer.email,
        metadata: payload.metadata
      });

      log.info('Paiement FedaPay initialisé', {
        transactionId: transaction.id,
        amount: transaction.amount,
        customer: customer.email
      });

      return {
        transaction_id: transaction.id,
        reference: transaction.reference,
        amount: transaction.amount,
        status: transaction.status,
        payment_url: transaction.transaction_url,
        qr_code: transaction.qr_code
      };

    } catch (error) {
      log.error('Erreur initialisation paiement FedaPay:', error);

      if (error.response) {
        const fedapayError = error.response.data;
        throw new AppError(
          `Erreur FedaPay: ${fedapayError.message || 'Erreur de paiement'}`,
          error.response.status
        );
      }

      if (error.code === 'ECONNABORTED') {
        throw new AppError('Timeout de connexion à FedaPay', 408);
      }

      throw new AppError('Erreur lors de l\'initialisation du paiement', 500);
    }
  }

  // Vérification du statut d'une transaction
  async verifyTransaction(transactionId) {
    try {
      const response = await this.client.get(`/transactions/${transactionId}`);

      if (!response.data || !response.data.transaction) {
        throw new AppError('Transaction non trouvée', 404);
      }

      const transaction = response.data.transaction;

      // Mise à jour du statut en base
      await this.updateTransactionStatus(transactionId, transaction.status);

      log.info('Statut transaction vérifié', {
        transactionId,
        status: transaction.status,
        amount: transaction.amount
      });

      return {
        transaction_id: transaction.id,
        reference: transaction.reference,
        amount: transaction.amount,
        status: transaction.status,
        paid_at: transaction.paid_at,
        created_at: transaction.created_at
      };

    } catch (error) {
      log.error('Erreur vérification transaction FedaPay:', error);

      if (error.response && error.response.status === 404) {
        throw new AppError('Transaction non trouvée', 404);
      }

      throw new AppError('Erreur lors de la vérification de la transaction', 500);
    }
  }

  // Remboursement
  async refundTransaction(transactionId, amount = null) {
    try {
      const payload = amount ? { amount: Math.round(amount) } : {};

      const response = await this.client.post(
        `/transactions/${transactionId}/refunds`,
        payload
      );

      if (!response.data || !response.data.refund) {
        throw new AppError('Réponse invalide de FedaPay', 500);
      }

      const refund = response.data.refund;

      // Log du remboursement
      await this.logRefund({
        transaction_id: transactionId,
        refund_id: refund.id,
        amount: refund.amount,
        status: refund.status,
        fedapay_reference: refund.reference
      });

      log.info('Remboursement FedaPay initié', {
        transactionId,
        refundId: refund.id,
        amount: refund.amount
      });

      return {
        refund_id: refund.id,
        transaction_id: transactionId,
        amount: refund.amount,
        status: refund.status,
        reference: refund.reference,
        created_at: refund.created_at
      };

    } catch (error) {
      log.error('Erreur remboursement FedaPay:', error);

      if (error.response) {
        const fedapayError = error.response.data;
        throw new AppError(
          `Erreur remboursement: ${fedapayError.message || 'Erreur FedaPay'}`,
          error.response.status
        );
      }

      throw new AppError('Erreur lors du remboursement', 500);
    }
  }

  // Log des transactions
  async logTransaction(transactionData) {
    try {
      const { error } = await supabase
        .from('payment_transactions')
        .insert({
          ...transactionData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('Erreur log transaction:', error);
      }
    } catch (error) {
      console.error('Erreur log transaction:', error);
    }
  }

  // Mise à jour statut transaction
  async updateTransactionStatus(transactionId, status) {
    try {
      const { error } = await supabase
        .from('payment_transactions')
        .update({
          status: status,
          updated_at: new Date().toISOString()
        })
        .eq('transaction_id', transactionId);

      if (error) {
        console.error('Erreur mise à jour statut transaction:', error);
      }
    } catch (error) {
      console.error('Erreur mise à jour statut transaction:', error);
    }
  }

  // Log des remboursements
  async logRefund(refundData) {
    try {
      const { error } = await supabase
        .from('payment_refunds')
        .insert({
          ...refundData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('Erreur log remboursement:', error);
      }
    } catch (error) {
      console.error('Erreur log remboursement:', error);
    }
  }

  // Vérification de la santé du service
  async healthCheck() {
    try {
      const response = await this.client.get('/accounts/balance', {
        timeout: 10000
      });

      return {
        status: 'healthy',
        service: 'fedapay',
        balance: response.data.balance,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      log.error('Health check FedaPay échoué:', error);
      return {
        status: 'unhealthy',
        service: 'fedapay',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

export const fedapayService = new FedapayService();