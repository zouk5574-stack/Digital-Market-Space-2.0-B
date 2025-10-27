import { supabase } from '../config/database.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { log } from '../utils/logger.js';

export const withdrawalController = {
  // Demande de retrait
  requestWithdrawal: asyncHandler(async (req, res) => {
    const { amount, payment_method, account_details } = req.body;
    const userId = req.user.id;

    // Validation des données
    if (!amount || amount <= 0) {
      throw new AppError('Montant de retrait invalide', 400);
    }

    if (!payment_method || !['bank_transfer', 'mobile_money'].includes(payment_method)) {
      throw new AppError('Méthode de paiement invalide', 400);
    }

    if (!account_details || !account_details.account_number) {
      throw new AppError('Détails du compte requis', 400);
    }

    // Vérification du solde
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('balance, total_withdrawals, first_name, last_name, email')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      throw new AppError('Utilisateur non trouvé', 404);
    }

    // Montant minimum de retrait
    const minWithdrawal = 5000; // 5000 FCFA minimum
    if (amount < minWithdrawal) {
      throw new AppError(`Le montant minimum de retrait est de ${minWithdrawal} FCFA`, 400);
    }

    // Vérification du solde suffisant
    if (user.balance < amount) {
      throw new AppError('Solde insuffisant pour ce retrait', 400);
    }

    // Vérification des limites de retrait
    const dailyLimit = 500000; // 500,000 FCFA par jour
    const today = new Date().toISOString().split('T')[0];
    
    const { data: todayWithdrawals, error: withdrawalsError } = await supabase
      .from('withdrawals')
      .select('amount')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .gte('created_at', today)
      .lte('created_at', `${today}T23:59:59.999Z`);

    if (withdrawalsError) {
      log.error('Erreur vérification limites retrait:', withdrawalsError);
      throw new AppError('Erreur vérification limites', 500);
    }

    const totalToday = todayWithdrawals?.reduce((sum, w) => sum + w.amount, 0) || 0;
    
    if (totalToday + amount > dailyLimit) {
      throw new AppError(`Limite quotidienne de retrait dépassée. Maximum: ${dailyLimit} FCFA`, 400);
    }

    // Création de la demande de retrait
    const { data: withdrawal, error: withdrawalError } = await supabase
      .from('withdrawals')
      .insert({
        user_id: userId,
        amount: amount,
        payment_method: payment_method,
        account_details: account_details,
        status: 'pending',
        reference: `WD${Date.now()}${userId.slice(0, 8)}`,
        metadata: {
          user_email: user.email,
          user_name: `${user.first_name} ${user.last_name}`,
          previous_balance: user.balance,
          new_balance: user.balance - amount
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (withdrawalError) {
      log.error('Erreur création demande retrait:', withdrawalError);
      throw new AppError('Erreur lors de la création de la demande de retrait', 500);
    }

    // Mise à jour du solde utilisateur
    const { error: updateError } = await supabase
      .from('users')
      .update({
        balance: user.balance - amount,
        total_withdrawals: (user.total_withdrawals || 0) + amount,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateError) {
      // Rollback en cas d'erreur
      await supabase
        .from('withdrawals')
        .delete()
        .eq('id', withdrawal.id);

      log.error('Erreur mise à jour solde après retrait:', updateError);
      throw new AppError('Erreur lors du traitement du retrait', 500);
    }

    log.info('Demande de retrait créée avec succès', {
      withdrawalId: withdrawal.id,
      userId: userId,
      amount: amount,
      paymentMethod: payment_method
    });

    res.status(201).json({
      success: true,
      message: 'Demande de retrait créée avec succès',
      data: {
        withdrawal: withdrawal,
        new_balance: user.balance - amount
      }
    });
  }),

  // Historique des retraits
  getWithdrawalHistory: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { page = 1, limit = 10, status } = req.query;

    const offset = (page - 1) * limit;

    let query = supabase
      .from('withdrawals')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    query = query.range(offset, offset + limit - 1);

    const { data: withdrawals, error, count } = await query;

    if (error) {
      log.error('Erreur récupération historique retraits:', error);
      throw new AppError('Erreur lors de la récupération de l\'historique', 500);
    }

    // Calcul des statistiques
    const stats = await this.calculateWithdrawalStats(userId);

    res.json({
      success: true,
      data: {
        withdrawals: withdrawals || [],
        stats: stats,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit)
        }
      }
    });
  }),

  // Calcul des statistiques de retrait
  async calculateWithdrawalStats(userId) {
    const { data: withdrawals } = await supabase
      .from('withdrawals')
      .select('amount, status, created_at')
      .eq('user_id', userId);

    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

    const monthlyWithdrawals = withdrawals
      ?.filter(w => 
        w.status === 'completed' &&
        new Date(w.created_at) >= lastMonth
      )
      .reduce((sum, w) => sum + w.amount, 0) || 0;

    const pendingWithdrawals = withdrawals
      ?.filter(w => w.status === 'pending')
      .reduce((sum, w) => sum + w.amount, 0) || 0;

    const totalCompleted = withdrawals
      ?.filter(w => w.status === 'completed')
      .length || 0;

    return {
      monthly_withdrawals: monthlyWithdrawals,
      pending_withdrawals: pendingWithdrawals,
      total_withdrawals: totalCompleted,
      average_withdrawal: totalCompleted > 0 ? 
        (withdrawals?.filter(w => w.status === 'completed')
          .reduce((sum, w) => sum + w.amount, 0) / totalCompleted) || 0 : 0
    };
  },

  // Détails d'un retrait spécifique
  getWithdrawalDetails: asyncHandler(async (req, res) => {
    const { withdrawal_id } = req.params;
    const userId = req.user.id;

    const { data: withdrawal, error } = await supabase
      .from('withdrawals')
      .select('*')
      .eq('id', withdrawal_id)
      .eq('user_id', userId)
      .single();

    if (error || !withdrawal) {
      throw new AppError('Retrait non trouvé', 404);
    }

    res.json({
      success: true,
      data: {
        withdrawal: withdrawal
      }
    });
  }),

  // Annulation d'un retrait (seulement si en attente)
  cancelWithdrawal: asyncHandler(async (req, res) => {
    const { withdrawal_id } = req.params;
    const userId = req.user.id;

    // Vérification du retrait
    const { data: withdrawal, error: withdrawalError } = await supabase
      .from('withdrawals')
      .select('*')
      .eq('id', withdrawal_id)
      .eq('user_id', userId)
      .single();

    if (withdrawalError || !withdrawal) {
      throw new AppError('Retrait non trouvé', 404);
    }

    // Vérification que le retrait peut être annulé
    if (withdrawal.status !== 'pending') {
      throw new AppError('Impossible d\'annuler un retrait déjà traité', 400);
    }

    // Récupération du solde actuel
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('balance')
      .eq('id', userId)
      .single();

    if (userError) {
      throw new AppError('Erreur récupération utilisateur', 500);
    }

    // Début de la transaction
    const { error: updateWithdrawalError } = await supabase
      .from('withdrawals')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
        metadata: {
          ...withdrawal.metadata,
          cancelled_at: new Date().toISOString(),
          cancelled_by: 'user'
        }
      })
      .eq('id', withdrawal_id);

    if (updateWithdrawalError) {
      throw new AppError('Erreur lors de l\'annulation du retrait', 500);
    }

    // Remboursement du solde
    const { error: updateBalanceError } = await supabase
      .from('users')
      .update({
        balance: (user.balance || 0) + withdrawal.amount,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateBalanceError) {
      // Rollback en cas d'erreur
      await supabase
        .from('withdrawals')
        .update({
          status: 'pending',
          updated_at: new Date().toISOString()
        })
        .eq('id', withdrawal_id);

      throw new AppError('Erreur lors du remboursement du solde', 500);
    }

    log.info('Retrait annulé avec succès', {
      withdrawalId: withdrawal_id,
      userId: userId,
      amount: withdrawal.amount
    });

    res.json({
      success: true,
      message: 'Retrait annulé avec succès',
      data: {
        withdrawal_id: withdrawal_id,
        refunded_amount: withdrawal.amount,
        new_balance: (user.balance || 0) + withdrawal.amount
      }
    });
  }),

  // Limites de retrait
  getWithdrawalLimits: asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const today = new Date().toISOString().split('T')[0];
    
    const { data: todayWithdrawals, error } = await supabase
      .from('withdrawals')
      .select('amount')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .gte('created_at', today)
      .lte('created_at', `${today}T23:59:59.999Z`);

    if (error) {
      log.error('Erreur calcul limites retrait:', error);
      throw new AppError('Erreur calcul des limites', 500);
    }

    const dailyLimit = 500000;
    const usedToday = todayWithdrawals?.reduce((sum, w) => sum + w.amount, 0) || 0;
    const remainingToday = Math.max(0, dailyLimit - usedToday);

    const limits = {
      daily_limit: dailyLimit,
      used_today: usedToday,
      remaining_today: remainingToday,
      min_withdrawal: 5000,
      max_withdrawal: 500000,
      allowed_methods: ['bank_transfer', 'mobile_money'],
      processing_time: '24-48 heures'
    };

    res.json({
      success: true,
      data: limits
    });
  })
};