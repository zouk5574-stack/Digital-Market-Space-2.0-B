import FedaPay from 'fedapay';
import { supabase } from '../config/supabase.js';

// Configuration
const PLATFORM_COMMISSION_RATE = 0.10; // 10%
const FRONTEND_URL = process.env.FRONTEND_URL;

class FedaPayService {
  constructor() {
    this.apiKey = process.env.FEDAPAY_API_KEY;
    this.environment = process.env.FEDAPAY_ENVIRONMENT || 'sandbox';
  }

  /**
   * Initialise la configuration FedaPay
   */
  initConfig(apiKey = null, environment = null) {
    const configApiKey = apiKey || this.apiKey;
    const configEnv = environment || this.environment;
    
    if (!configApiKey) {
      throw new Error('Clé API FedaPay non configurée');
    }

    FedaPay.setApiKey(configApiKey);
    FedaPay.setEnvironment(configEnv);
  }

  /**
   * Crée un paiement FedaPay pour produits
   */
  async createProductPayment(amount, description, orderId, buyerId, currency = 'XOF') {
    try {
      this.initConfig();

      const transaction = await FedaPay.Transaction.create({
        description: description,
        amount: Math.round(amount),
        currency: { code: currency },
        metadata: {
          type: 'ORDER_PRODUCT',
          order_id: orderId,
          buyer_id: buyerId,
          platform: 'Digital Market Space'
        },
        callback_url: `${FRONTEND_URL}/buyer/orders/${orderId}/status`,
        cancel_url: `${FRONTEND_URL}/buyer/orders/${orderId}/cancel`,
      });

      const token = await transaction.generateToken();
      
      return {
        success: true,
        transaction: transaction,
        payment_url: token.url,
        transaction_id: transaction.id
      };

    } catch (error) {
      console.error('❌ Erreur FedaPay createProductPayment:', error.message);
      throw new Error(`Erreur création paiement: ${error.message}`);
    }
  }

  /**
   * Crée un paiement escrow pour missions freelance
   */
  async createEscrowPayment(amount, description, missionId, clientId, freelancerId, currency = 'XOF') {
    try {
      this.initConfig();

      const transaction = await FedaPay.Transaction.create({
        description: description,
        amount: Math.round(amount),
        currency: { code: currency },
        metadata: {
          type: 'ESCROW_SERVICE',
          mission_id: missionId,
          client_id: clientId,
          freelancer_id: freelancerId,
          platform: 'Digital Market Space',
          escrow_conditions: 'mission_completion'
        },
        callback_url: `${FRONTEND_URL}/client/missions/${missionId}/status`,
        cancel_url: `${FRONTEND_URL}/client/missions/${missionId}/cancel`,
      });

      const token = await transaction.generateToken();
      
      return {
        success: true,
        transaction: transaction,
        payment_url: token.url,
        transaction_id: transaction.id
      };

    } catch (error) {
      console.error('❌ Erreur FedaPay createEscrowPayment:', error.message);
      throw new Error(`Erreur création escrow: ${error.message}`);
    }
  }

  /**
   * Vérifie le statut d'une transaction
   */
  async getTransactionStatus(transactionId) {
    try {
      this.initConfig();

      const transaction = await FedaPay.Transaction.retrieve(transactionId);
      
      return {
        success: true,
        transaction: transaction,
        status: transaction.status,
        amount: transaction.amount,
        currency: transaction.currency
      };

    } catch (error) {
      console.error('❌ Erreur FedaPay getTransactionStatus:', error.message);
      throw new Error(`Erreur vérification statut: ${error.message}`);
    }
  }

  /**
   * Effectue un remboursement
   */
  async refundTransaction(transactionId, amount, reason) {
    try {
      this.initConfig();

      const refund = await FedaPay.Refund.create({
        transaction_id: transactionId,
        amount: Math.round(amount),
        reason: reason.substring(0, 255)
      });

      return {
        success: true,
        refund: refund,
        refund_id: refund.id
      };

    } catch (error) {
      console.error('❌ Erreur FedaPay refundTransaction:', error.message);
      throw new Error(`Erreur remboursement: ${error.message}`);
    }
  }

  /**
   * Valide une signature webhook
   */
  verifyWebhookSignature(payload, signature) {
    const crypto = require('crypto');
    const secret = process.env.FEDAPAY_WEBHOOK_SECRET;
    
    if (!secret) {
      throw new Error('FEDAPAY_WEBHOOK_SECRET non configuré');
    }

    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature, 'utf8'),
      Buffer.from(computedSignature, 'utf8')
    );
  }

  // ===========================================
  // 💰 LOGIQUE DE DISTRIBUTION DES FONDS
  // ===========================================

  /**
   * Distribue les fonds d'une commande produit
   */
  async distributeOrderFunds(orderId, internalTransactionId) {
    try {
      // 1. Récupérer les articles de la commande
      const { data: orderItems, error: itemsError } = await supabase
        .from('order_items')
        .select(`
          quantity, 
          price,
          product:products(
            shop:shops(
              user_id,
              commission_rate
            )
          )
        `)
        .eq('order_id', orderId);

      if (itemsError || !orderItems || orderItems.length === 0) {
        throw new Error(`Articles de commande non trouvés: ${orderId}`);
      }

      // 2. Calcul et répartition des fonds
      const creditPromises = [];
      let totalCommission = 0;

      for (const item of orderItems) {
        const shop = item.product.shop;
        const saleAmount = item.price * item.quantity;
        const commissionRate = shop.commission_rate || PLATFORM_COMMISSION_RATE;
        const commissionAmount = saleAmount * commissionRate;
        const sellerAmount = saleAmount - commissionAmount;
        
        totalCommission += commissionAmount;

        // Enregistrer la commission
        creditPromises.push(
          supabase.from("commissions").insert({
            order_id: orderId,
            shop_id: shop.id,
            seller_id: shop.user_id,
            amount: commissionAmount,
            seller_amount: sellerAmount,
            rate: commissionRate,
            status: "pending",
            type: 'product'
          })
        );

        // Créditer le portefeuille du vendeur
        creditPromises.push(
          supabase
            .from('wallets')
            .update({ 
              pending_balance: supabase.raw('pending_balance + ??', [sellerAmount])
            })
            .eq('user_id', shop.user_id)
        );
      }

      // 3. Exécution atomique
      await Promise.all(creditPromises);

      // 4. Mettre à jour le statut de la commande
      await supabase
        .from('orders')
        .update({ 
          status: 'paid',
          payment_status: 'completed',
          paid_at: new Date().toISOString()
        })
        .eq('id', orderId);

      return totalCommission;

    } catch (error) {
      console.error('❌ Erreur distributeOrderFunds:', error);
      throw error;
    }
  }

  /**
   * Débloque les fonds escrow d'une mission
   */
  async releaseEscrowFunds(missionId, escrowTransactionId, freelancerId, finalPrice) {
    try {
      const commissionAmount = finalPrice * PLATFORM_COMMISSION_RATE;
      const netAmount = finalPrice - commissionAmount;

      // 1. Enregistrer la commission
      const commissionPromise = supabase.from("commissions").insert({
        mission_id: missionId,
        seller_id: freelancerId,
        amount: commissionAmount,
        rate: PLATFORM_COMMISSION_RATE,
        status: "released",
        type: 'mission'
      });

      // 2. Créditer le portefeuille du freelancer
      const creditPromise = supabase
        .from('wallets')
        .update({ 
          balance: supabase.raw('balance + ??', [netAmount])
        })
        .eq('user_id', freelancerId);

      // 3. Mettre à jour la mission
      const missionPromise = supabase
        .from('freelance_missions')
        .update({ 
          status: 'completed',
          escrow_status: 'released',
          completed_at: new Date().toISOString()
        })
        .eq('id', missionId);

      // 4. Exécution atomique
      await Promise.all([commissionPromise, creditPromise, missionPromise]);

      // 5. Créer une transaction pour le crédit
      await supabase
        .from('transactions')
        .insert({
          user_id: freelancerId,
          amount: netAmount,
          type: 'commission_release',
          status: 'completed',
          description: `Paiement mission #${missionId}`,
          metadata: {
            mission_id: missionId,
            escrow_transaction_id: escrowTransactionId,
            commission: commissionAmount
          }
        });

      return commissionAmount;

    } catch (error) {
      console.error('❌ Erreur releaseEscrowFunds:', error);
      throw error;
    }
  }

  /**
   * Rembourse une mission (annulation)
   */
  async refundMission(missionId, clientId, amount) {
    try {
      // Mettre à jour le statut de la mission
      await supabase
        .from('freelance_missions')
        .update({ 
          status: 'cancelled',
          escrow_status: 'refunded',
          cancelled_at: new Date().toISOString()
        })
        .eq('id', missionId);

      // Créer une transaction de remboursement
      await supabase
        .from('transactions')
        .insert({
          user_id: clientId,
          amount: amount,
          type: 'refund',
          status: 'completed',
          description: `Remboursement mission #${missionId}`,
          metadata: {
            mission_id: missionId,
            refund_reason: 'mission_cancelled'
          }
        });

      return true;

    } catch (error) {
      console.error('❌ Erreur refundMission:', error);
      throw error;
    }
  }
}

export default new FedaPayService();
