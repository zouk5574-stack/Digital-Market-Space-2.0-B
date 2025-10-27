const database = require('../config/database');
const logger = require('../utils/logger');
const { Response, Error, Financial, Date } = require('../utils/helpers');
const constants = require('../utils/constants');

class WalletService {
  constructor() {
    this.table = 'wallet_transactions';
    this.usersTable = 'users';
  }

  async getUserWallet(userId) {
    try {
      logger.debug(`Récupération portefeuille utilisateur: ${userId}`);

      const user = await database.safeSelect(
        this.usersTable,
        { id: userId },
        { 
          single: true,
          fields: 'id, balance, completed_orders, rating, response_rate'
        }
      );

      if (!user) {
        throw new Error('Utilisateur non trouvé');
      }

      // Récupérer les transactions récentes
      const recentTransactions = await database.safeSelect(
        this.table,
        { user_id: userId },
        {
          fields: '*',
          orderBy: ['created_at:desc'],
          limit: 10
        }
      );

      const walletData = {
        user_id: user.id,
        balance: user.balance || 0,
        available_balance: this.calculateAvailableBalance(user.balance || 0),
        pending_balance: this.calculatePendingBalance(userId),
        currency: 'XOF',
        stats: {
          completed_orders: user.completed_orders || 0,
          total_earnings: await this.calculateTotalEarnings(userId),
          average_order_value: await this.calculateAverageOrderValue(userId)
        },
        recent_transactions: recentTransactions
      };

      return Response.success(walletData, 'Portefeuille récupéré avec succès');

    } catch (err) {
      const handledError = Error.handleServiceError(err, 'WalletService.getUserWallet', { userId });
      return Response.error(handledError.message);
    }
  }

  async releaseOrderFunds(orderId, sellerId, amount) {
    const transactionId = `wallet_release_${orderId}_${Date.now()}`;
    
    try {
      logger.info(`Libération fonds commande: ${transactionId}`, { orderId, sellerId, amount });

      const transaction = {
        user_id: sellerId,
        type: 'credit',
        amount: Financial.formatAmount(amount),
        currency: 'XOF',
        status: 'completed',
        source: 'order_completion',
        description: `Paiement pour commande ${orderId}`,
        reference: `REL_${orderId}_${Date.now()}`,
        order_id: orderId,
        metadata: {
          order_id: orderId,
          released_at: new Date().toISOString()
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Exécuter la transaction
      const operations = [
        {
          table: this.table,
          action: 'insert',
          data: transaction
        },
        {
          table: this.usersTable,
          action: 'update',
          data: {
            balance: database.client.raw(`balance + ${amount}`),
            completed_orders: database.client.raw('completed_orders + 1'),
            updated_at: new Date().toISOString()
          },
          conditions: { id: sellerId }
        }
      ];

      const results = await database.executeTransaction(operations);

      logger.info(`Fonds libérés avec succès: ${transactionId}`, {
        orderId,
        sellerId,
        amount,
        transactionId: results[0].id
      });

      return Response.success(results[0], 'Fonds libérés avec succès');

    } catch (err) {
      const handledError = Error.handleServiceError(err, 'WalletService.releaseOrderFunds', {
        transactionId,
        orderId,
        sellerId,
        amount
      });
      
      logger.error(`Échec libération fonds: ${transactionId}`, {
        error: handledError.message
      });
      
      return Response.error(handledError.message);
    }
  }

  async getTransactionHistory(userId, filters = {}) {
    try {
      const { 
        page = 1, 
        limit = constants.LIMITS.DEFAULT_PAGE_LIMIT, 
        type,
        status,
        start_date,
        end_date 
      } = filters;

      const offset = (page - 1) * limit;

      let query = database.client
        .from(this.table)
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      // Appliquer les filtres
      if (type && type !== 'all') {
        query = query.eq('type', type);
      }

      if (status && status !== 'all') {
        query = query.eq('status', status);
      }

      if (start_date) {
        query = query.gte('created_at', new Date(start_date).toISOString());
      }

      if (end_date) {
        query = query.lte('created_at', new Date(end_date).toISOString());
      }

      query = query.range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      const pagination = {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count
      };

      return Response.paginated(data, pagination, 'Historique des transactions récupéré');

    } catch (err) {
      const handledError = Error.handleServiceError(err, 'WalletService.getTransactionHistory', {
        userId,
        filters
      });
      
      return Response.error(handledError.message);
    }
  }

  async validateWithdrawalAmount(userId, amount) {
    try {
      const user = await database.safeSelect(
        this.usersTable,
        { id: userId },
        { single: true, fields: 'balance' }
      );

      if (!user) {
        throw new Error('Utilisateur non trouvé');
      }

      const availableBalance = this.calculateAvailableBalance(user.balance || 0);
      const withdrawalFee = Financial.calculateWithdrawalFee(amount);
      const netAmount = Financial.calculateNetWithdrawalAmount(amount);

      const validation = {
        isValid: amount >= constants.LIMITS.MIN_WITHDRAWAL_AMOUNT && 
                 netAmount <= availableBalance,
        availableBalance,
        requestedAmount: amount,
        withdrawalFee,
        netAmount,
        minAmount: constants.LIMITS.MIN_WITHDRAWAL_AMOUNT,
        maxAmount: availableBalance,
        message: null
      };

      if (!validation.isValid) {
        if (amount < constants.LIMITS.MIN_WITHDRAWAL_AMOUNT) {
          validation.message = `Le montant minimum de retrait est ${constants.LIMITS.MIN_WITHDRAWAL_AMOUNT} FCFA`;
        } else if (netAmount > availableBalance) {
          validation.message = `Solde insuffisant. Solde disponible: ${availableBalance} FCFA`;
        }
      }

      return validation;

    } catch (err) {
      const handledError = Error.handleServiceError(err, 'WalletService.validateWithdrawalAmount', {
        userId,
        amount
      });
      
      throw handledError;
    }
  }

  // Méthodes helper internes
  calculateAvailableBalance(balance) {
    // Pour l'instant, tout le solde est disponible
    // On pourrait implémenter une logique pour les fonds en attente
    return Math.max(0, balance);
  }

  async calculatePendingBalance(userId) {
    // Calculer le montant des commandes en cours qui ne sont pas encore payées
    try {
      const { data } = await database.client
        .from('orders')
        .select('amount')
        .eq('seller_id', userId)
        .in('status', ['pending', 'in_progress']);

      return data?.reduce((sum, order) => sum + order.amount, 0) || 0;
    } catch (error) {
      logger.error('Erreur calcul solde en attente', { userId, error: error.message });
      return 0;
    }
  }

  async calculateTotalEarnings(userId) {
    try {
      const { data } = await database.client
        .from(this.table)
        .select('amount')
        .eq('user_id', userId)
        .eq('type', 'credit')
        .eq('status', 'completed');

      return data?.reduce((sum, transaction) => sum + transaction.amount, 0) || 0;
    } catch (error) {
      logger.error('Erreur calcul gains totaux', { userId, error: error.message });
      return 0;
    }
  }

  async calculateAverageOrderValue(userId) {
    try {
      const { data } = await database.client
        .from('orders')
        .select('amount')
        .eq('seller_id', userId)
        .eq('status', 'completed');

      if (!data || data.length === 0) return 0;

      const total = data.reduce((sum, order) => sum + order.amount, 0);
      return Math.round(total / data.length);
    } catch (error) {
      logger.error('Erreur calcul moyenne commande', { userId, error: error.message });
      return 0;
    }
  }
}

module.exports = new WalletService();