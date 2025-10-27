import { supabase } from '../config/database.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { log } from '../utils/logger.js';

export const walletController = {
  // Récupération du solde et infos wallet
  getWallet: asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const { data: user, error } = await supabase
      .from('users')
      .select(`
        balance,
        total_earnings,
        pending_balance,
        wallet_transactions(
          id,
          type,
          amount,
          status,
          description,
          created_at
        )
      `)
      .eq('id', userId)
      .single();

    if (error) {
      log.error('Erreur récupération wallet:', error);
      throw new AppError('Erreur lors de la récupération du wallet', 500);
    }

    // Calcul des statistiques
    const stats = await this.calculateWalletStats(userId);

    res.json({
      success: true,
      data: {
        balance: user.balance || 0,
        pending_balance: user.pending_balance || 0,
        total_earnings: user.total_earnings || 0,
        stats: stats,
        recent_transactions: user.wallet_transactions?.slice(0, 10) || []
      }
    });
  }),

  // Calcul des statistiques du wallet
  async calculateWalletStats(userId) {
    const { data: transactions } = await supabase
      .from('wallet_transactions')
      .select('type, amount, status, created_at')
      .eq('user_id', userId);

    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

    const monthlyEarnings = transactions
      ?.filter(t => 
        t.type === 'credit' && 
        t.status === 'completed' &&
        new Date(t.created_at) >= lastMonth
      )
      .reduce((sum, t) => sum + (t.amount || 0), 0) || 0;

    const totalCompleted = transactions
      ?.filter(t => t.status === 'completed')
      .length || 0;

    const pendingTransactions = transactions
      ?.filter(t => t.status === 'pending')
      .length || 0;

    return {
      monthly_earnings: monthlyEarnings,
      total_transactions: totalCompleted,
      pending_transactions: pendingTransactions,
      average_transaction: totalCompleted > 0 ? 
        (transactions?.filter(t => t.status === 'completed')
          .reduce((sum, t) => sum + (t.amount || 0), 0) / totalCompleted) || 0 : 0
    };
  },

  // Historique des transactions du wallet
  getTransactionHistory: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { page = 1, limit = 20, type, status } = req.query;

    const offset = (page - 1) * limit;

    let query = supabase
      .from('wallet_transactions')
      .select(`
        *,
        order:orders(
          id,
          mission:missions(title)
        )
      `, { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (type) {
      query = query.eq('type', type);
    }

    if (status) {
      query = query.eq('status', status);
    }

    query = query.range(offset, offset + limit - 1);

    const { data: transactions, error, count } = await query;

    if (error) {
      log.error('Erreur récupération historique transactions:', error);
      throw new AppError('Erreur lors de la récupération de l\'historique', 500);
    }

    res.json({
      success: true,
      data: {
        transactions: transactions || [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit)
        }
      }
    });
  }),

  // Vérification de la suffisance du solde
  checkBalance: asyncHandler(async (req, res) => {
    const { amount } = req.body;
    const userId = req.user.id;

    if (!amount || amount <= 0) {
      throw new AppError('Montant invalide', 400);
    }

    const { data: user } = await supabase
      .from('users')
      .select('balance')
      .eq('id', userId)
      .single();

    const hasSufficientBalance = (user.balance || 0) >= amount;

    res.json({
      success: true,
      data: {
        has_sufficient_balance: hasSufficientBalance,
        current_balance: user.balance || 0,
        required_amount: amount,
        difference: (user.balance || 0) - amount
      }
    });
  })

  // NOTE: La fonction internalTransfer a été supprimée comme demandé
  // Aucun transfert interne entre utilisateurs n'est autorisé
};