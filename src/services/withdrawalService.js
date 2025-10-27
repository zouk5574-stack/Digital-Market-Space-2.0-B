const database = require('../config/database');
const logger = require('../utils/logger');
const { Response, Error, Financial, Date } = require('../utils/helpers');
const constants = require('../utils/constants');
const walletService = require('./walletService');

class WithdrawalService {
  constructor() {
    this.table = 'withdrawals';
  }

  async createWithdrawal(withdrawalData, userId) {
    const transactionId = `withdrawal_create_${userId}_${Date.now()}`;
    
    try {
      logger.info(`Création demande retrait: ${transactionId}`, { userId, withdrawalData });

      const { amount, payment_method, payment_details } = withdrawalData;

      // Validation du montant
      const validation = await walletService.validateWithdrawalAmount(userId, amount);
      
      if (!validation.isValid) {
        throw new Error(validation.message);
      }

      // Vérifier la limite de retrait quotidienne
      const dailyWithdrawal = await this.getTodayWithdrawalAmount(userId);
      if (dailyWithdrawal + amount > constants.LIMITS.DAILY_WITHDRAWAL_LIMIT) {
        throw new Error(`Limite de retrait quotidienne dépassée. Maximum: ${constants.LIMITS.DAILY_WITHDRAWAL_LIMIT} FCFA par jour`);
      }

      const withdrawalFee = Financial.calculateWithdrawalFee(amount);
      const netAmount = Financial.calculateNetWithdrawalAmount(amount);

      const withdrawal = {
        user_id: userId,
        amount: Financial.formatAmount(amount),
        net_amount: netAmount,
        fee: withdrawalFee,
        currency: 'XOF',
        payment_method: payment_method,
        payment_details: payment_details,
        status: constants.WITHDRAWAL_STATUS.PENDING,
        reference: `WDL_${Date.now()}_${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Exécuter la transaction : créer le retrait ET bloquer les fonds
      const operations = [
        {
          table: this.table,
          action: 'insert',
          data: withdrawal
        },
        {
          table: 'wallet_transactions',
          action: 'insert',
          data: {
            user_id: userId,
            type: 'debit',
            amount: Financial.formatAmount(amount),
            currency: 'XOF',
            status: 'pending',
            source: 'withdrawal',
            description: `Demande de retrait - ${payment_method}`,
            reference: withdrawal.reference,
            withdrawal_id: null, // Sera mis à jour après création
            metadata: {
              net_amount: netAmount,
              fee: withdrawalFee,
              payment_method: payment_method
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        }
      ];

      const results = await database.executeTransaction(operations);

      // Mettre à jour l'ID de retrait dans la transaction
      await database.safeUpdate(
        'wallet_transactions',
        { withdrawal_id: results[0].id },
        { id: results[1].id }
      );

      logger.info(`Demande de retrait créée: ${transactionId}`, {
        withdrawalId: results[0].id,
        userId,
        amount,
        netAmount,
        paymentMethod: payment_method
      });

      return Response.success(results[0], 'Demande de retrait créée avec succès');

    } catch (err) {
      const handledError = Error.handleServiceError(err, 'WithdrawalService.createWithdrawal', {
        transactionId,
        userId,
        withdrawalData
      });
      
      logger.error(`Échec création retrait: ${transactionId}`, {
        error: handledError.message
      });
      
      return Response.error(handledError.message);
    }
  }

  async processWithdrawal(withdrawalId, adminId) {
    const transactionId = `withdrawal_process_${withdrawalId}_${Date.now()}`;
    
    try {
      logger.info(`Traitement retrait: ${transactionId}`, { withdrawalId, adminId });

      // Récupérer le retrait
      const withdrawal = await database.safeSelect(
        this.table,
        { id: withdrawalId },
        { single: true }
      );

      if (!withdrawal) {
        throw new Error('Demande de retrait non trouvée');
      }

      if (withdrawal.status !== constants.WITHDRAWAL_STATUS.PENDING) {
        throw new Error('Cette demande de retrait a déjà été traitée');
      }

      // Vérifier que l'utilisateur a toujours suffisamment de fonds
      const user = await database.safeSelect(
        'users',
        { id: withdrawal.user_id },
        { single: true, fields: 'balance' }
      );

      if (!user || user.balance < withdrawal.amount) {
        throw new Error('Solde insuffisant pour traiter ce retrait');
      }

      // Exécuter le retrait (simuler le virement)
      const processingResult = await this.executePayment(withdrawal);

      const updates = {
        status: constants.WITHDRAWAL_STATUS.PROCESSING,
        processed_by: adminId,
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      if (processingResult.success) {
        updates.status = constants.WITHDRAWAL_STATUS.COMPLETED;
        updates.completed_at = new Date().toISOString();
        updates.transaction_reference = processingResult.reference;

        // Déduire les fonds du portefeuille
        await database.safeUpdate(
          'users',
          {
            balance: database.client.raw(`balance - ${withdrawal.amount}`),
            updated_at: new Date().toISOString()
          },
          { id: withdrawal.user_id }
        );

        // Marquer la transaction comme complétée
        await database.safeUpdate(
          'wallet_transactions',
          {
            status: 'completed',
            updated_at: new Date().toISOString()
          },
          { withdrawal_id: withdrawalId }
        );
      } else {
        updates.status = constants.WITHDRAWAL_STATUS.FAILED;
        updates.failure_reason = processingResult.error;
      }

      const result = await database.safeUpdate(
        this.table,
        updates,
        { id: withdrawalId }
      );

      logger.info(`Retrait traité: ${transactionId}`, {
        withdrawalId,
        status: updates.status,
        adminId
      });

      return Response.success(result, `Retrait ${updates.status === constants.WITHDRAWAL_STATUS.COMPLETED ? 'traité' : 'échoué'} avec succès`);

    } catch (err) {
      const handledError = Error.handleServiceError(err, 'WithdrawalService.processWithdrawal', {
        transactionId,
        withdrawalId,
        adminId
      });
      
      logger.error(`Échec traitement retrait: ${transactionId}`, {
        error: handledError.message
      });
      
      return Response.error(handledError.message);
    }
  }

  async getUserWithdrawals(userId, filters = {}) {
    try {
      const { 
        page = 1, 
        limit = constants.LIMITS.DEFAULT_PAGE_LIMIT, 
        status 
      } = filters;

      const offset = (page - 1) * limit;

      let query = database.client
        .from(this.table)
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
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

      return Response.paginated(data, pagination, 'Historique des retraits récupéré');

    } catch (err) {
      const handledError = Error.handleServiceError(err, 'WithdrawalService.getUserWithdrawals', {
        userId,
        filters
      });
      
      return Response.error(handledError.message);
    }
  }

  async getPendingWithdrawals(filters = {}) {
    try {
      const { 
        page = 1, 
        limit = constants.LIMITS.DEFAULT_PAGE_LIMIT 
      } = filters;

      const offset = (page - 1) * limit;

      const withdrawals = await database.safeSelect(
        this.table,
        { status: constants.WITHDRAWAL_STATUS.PENDING },
        {
          fields: `
            *,
            user:users(first_name, last_name, username, email)
          `,
          orderBy: ['created_at:asc'],
          limit: limit,
          offset: offset
        }
      );

      const total = await database.safeSelect(
        this.table,
        { status: constants.WITHDRAWAL_STATUS.PENDING },
        { count: true }
      );

      const pagination = {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total.count
      };

      return Response.paginated(withdrawals, pagination, 'Retraits en attente récupérés');

    } catch (err) {
      const handledError = Error.handleServiceError(err, 'WithdrawalService.getPendingWithdrawals', {
        filters
      });
      
      return Response.error(handledError.message);
    }
  }

  async cancelWithdrawal(withdrawalId, userId) {
    const transactionId = `withdrawal_cancel_${withdrawalId}_${Date.now()}`;
    
    try {
      logger.info(`Annulation retrait: ${transactionId}`, { withdrawalId, userId });

      // Récupérer le retrait
      const withdrawal = await database.safeSelect(
        this.table,
        { id: withdrawalId },
        { single: true }
      );

      if (!withdrawal) {
        throw new Error('Demande de retrait non trouvée');
      }

      if (withdrawal.user_id !== userId) {
        throw new Error('Non autorisé à annuler ce retrait');
      }

      if (withdrawal.status !== constants.WITHDRAWAL_STATUS.PENDING) {
        throw new Error('Seuls les retraits en attente peuvent être annulés');
      }

      // Exécuter l'annulation
      const operations = [
        {
          table: this.table,
          action: 'update',
          data: {
            status: constants.WITHDRAWAL_STATUS.REJECTED,
            cancellation_reason: 'Annulé par l\'utilisateur',
            cancelled_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          conditions: { id: withdrawalId }
        },
        {
          table: 'wallet_transactions',
          action: 'update',
          data: {
            status: 'cancelled',
            updated_at: new Date().toISOString()
          },
          conditions: { withdrawal_id: withdrawalId }
        }
      ];

      const results = await database.executeTransaction(operations);

      logger.info(`Retrait annulé: ${transactionId}`, {
        withdrawalId,
        userId
      });

      return Response.success(results[0], 'Retrait annulé avec succès');

    } catch (err) {
      const handledError = Error.handleServiceError(err, 'WithdrawalService.cancelWithdrawal', {
        transactionId,
        withdrawalId,
        userId
      });
      
      logger.error(`Échec annulation retrait: ${transactionId}`, {
        error: handledError.message
      });
      
      return Response.error(handledError.message);
    }
  }

  // Méthodes helper internes
  async getTodayWithdrawalAmount(userId) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data } = await database.client
        .from(this.table)
        .select('amount')
        .eq('user_id', userId)
        .eq('status', constants.WITHDRAWAL_STATUS.COMPLETED)
        .gte('created_at', today.toISOString());

      return data?.reduce((sum, withdrawal) => sum + withdrawal.amount, 0) || 0;
    } catch (error) {
      logger.error('Erreur calcul retraits du jour', { userId, error: error.message });
      return 0;
    }
  }

  async executePayment(withdrawal) {
    // Simuler l'exécution du paiement
    // En production, cette méthode intégrerait avec l'API de paiement (FedaPay, etc.)
    
    try {
      // Simulation de traitement
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 95% de succès en simulation
      const success = Math.random() > 0.05;

      if (success) {
        return {
          success: true,
          reference: `PMT_${Date.now()}_${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
          message: 'Paiement exécuté avec succès'
        };
      } else {
        return {
          success: false,
          error: 'Échec du traitement du paiement',
          message: 'Veuillez réessayer ou contacter le support'
        };
      }
    } catch (error) {
      logger.error('Erreur exécution paiement', {
        withdrawalId: withdrawal.id,
        error: error.message
      });
      
      return {
        success: false,
        error: 'Erreur technique lors du traitement',
        message: 'Veuillez contacter le support'
      };
    }
  }

  async getWithdrawalStats(userId) {
    try {
      const stats = await database.client
        .from(this.table)
        .select('status, amount', { count: 'exact' })
        .eq('user_id', userId);

      if (stats.error) throw stats.error;

      const statusCounts = {
        total: stats.count,
        pending: 0,
        processing: 0,
        completed: 0,
        rejected: 0,
        failed: 0
      };

      let totalWithdrawn = 0;
      let totalFees = 0;

      stats.data.forEach(withdrawal => {
        if (statusCounts[withdrawal.status] !== undefined) {
          statusCounts[withdrawal.status]++;
        }

        if (withdrawal.status === constants.WITHDRAWAL_STATUS.COMPLETED) {
          totalWithdrawn += withdrawal.amount;
          totalFees += withdrawal.fee || 0;
        }
      });

      return Response.success({
        ...statusCounts,
        total_withdrawn: totalWithdrawn,
        total_fees: totalFees,
        net_withdrawn: totalWithdrawn - totalFees
      }, 'Statistiques de retrait récupérées');

    } catch (err) {
      const handledError = Error.handleServiceError(err, 'WithdrawalService.getWithdrawalStats', { userId });
      return Response.error(handledError.message);
    }
  }
}

module.exports = new WithdrawalService();