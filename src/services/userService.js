const database = require('../config/database');
const logger = require('../utils/logger');
const { Response, Error } = require('../utils/helpers');
const constants = require('../utils/constants');

class UserService {
  constructor() {
    this.table = 'users';
  }

  async getUserProfile(userId) {
    try {
      logger.debug(`Récupération profil utilisateur: ${userId}`);

      const user = await database.safeSelect(
        this.table,
        { id: userId },
        { 
          single: true,
          fields: `
            id,
            email,
            first_name,
            last_name,
            username,
            phone,
            role_id,
            balance,
            completed_missions,
            completed_orders,
            rating,
            response_rate,
            profile_data,
            last_active,
            created_at,
            updated_at
          `
        }
      );

      if (!user) {
        throw new Error('Utilisateur non trouvé');
      }

      return Response.success(user, 'Profil utilisateur récupéré avec succès');

    } catch (err) {
      const handledError = Error.handleServiceError(err, 'UserService.getUserProfile', { userId });
      return Response.error(handledError.message);
    }
  }

  async updateUserProfile(userId, updates) {
    const transactionId = `profile_update_${userId}_${Date.now()}`;
    
    try {
      logger.info(`Mise à jour profil utilisateur: ${transactionId}`, { userId, updates });

      const allowedUpdates = [
        'first_name', 'last_name', 'username', 'phone', 'profile_data'
      ];
      
      const cleanUpdates = {};
      Object.keys(updates).forEach(key => {
        if (allowedUpdates.includes(key)) {
          cleanUpdates[key] = updates[key];
        }
      });

      if (Object.keys(cleanUpdates).length === 0) {
        throw new Error('Aucune donnée valide à mettre à jour');
      }

      cleanUpdates.updated_at = new Date().toISOString();

      const result = await database.safeUpdate(this.table, cleanUpdates, { id: userId });

      logger.info(`Profil utilisateur mis à jour: ${transactionId}`, {
        userId,
        updates: Object.keys(cleanUpdates)
      });

      return Response.success(result, 'Profil mis à jour avec succès');

    } catch (err) {
      const handledError = Error.handleServiceError(err, 'UserService.updateUserProfile', {
        transactionId,
        userId,
        updates
      });
      
      logger.error(`Échec mise à jour profil: ${transactionId}`, {
        error: handledError.message
      });
      
      return Response.error(handledError.message);
    }
  }

  async updateUserRating(userId, newRating) {
    try {
      logger.debug(`Mise à jour rating utilisateur: ${userId}`, { newRating });

      // Récupérer le rating actuel
      const user = await database.safeSelect(
        this.table,
        { id: userId },
        { single: true, fields: 'rating, completed_orders' }
      );

      if (!user) {
        throw new Error('Utilisateur non trouvé');
      }

      // Calculer le nouveau rating moyen
      const currentRating = user.rating || 0;
      const orderCount = user.completed_orders || 0;
      
      const updatedRating = orderCount > 0 
        ? ((currentRating * orderCount) + newRating) / (orderCount + 1)
        : newRating;

      const result = await database.safeUpdate(
        this.table,
        {
          rating: parseFloat(updatedRating.toFixed(2)),
          updated_at: new Date().toISOString()
        },
        { id: userId }
      );

      return Response.success(result, 'Rating mis à jour avec succès');

    } catch (err) {
      const handledError = Error.handleServiceError(err, 'UserService.updateUserRating', {
        userId,
        newRating
      });
      
      return Response.error(handledError.message);
    }
  }

  async searchUsers(filters = {}) {
    try {
      const { 
        query,
        role_id,
        min_rating,
        max_rating,
        page = 1,
        limit = 20
      } = filters;

      const offset = (page - 1) * limit;

      let dbQuery = database.client
        .from(this.table)
        .select(`
          id,
          first_name,
          last_name,
          username,
          email,
          role_id,
          rating,
          completed_orders,
          response_rate,
          created_at
        `, { count: 'exact' })
        .eq('status', 'active');

      // Filtre par recherche textuelle
      if (query) {
        dbQuery = dbQuery.or(
          `first_name.ilike.%${query}%,last_name.ilike.%${query}%,username.ilike.%${query}%`
        );
      }

      // Filtre par rôle
      if (role_id) {
        dbQuery = dbQuery.eq('role_id', parseInt(role_id));
      }

      // Filtre par rating
      if (min_rating) {
        dbQuery = dbQuery.gte('rating', parseFloat(min_rating));
      }

      if (max_rating) {
        dbQuery = dbQuery.lte('rating', parseFloat(max_rating));
      }

      // Pagination et tri
      dbQuery = dbQuery
        .order('rating', { ascending: false })
        .order('completed_orders', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data, error, count } = await dbQuery;

      if (error) throw error;

      const pagination = {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count
      };

      return Response.paginated(data, pagination, 'Utilisateurs trouvés avec succès');

    } catch (err) {
      const handledError = Error.handleServiceError(err, 'UserService.searchUsers', { filters });
      return Response.error(handledError.message);
    }
  }

  async getUserStats(userId) {
    try {
      logger.debug(`Récupération statistiques utilisateur: ${userId}`);

      const user = await database.safeSelect(
        this.table,
        { id: userId },
        { 
          single: true,
          fields: 'completed_missions, completed_orders, rating, response_rate, balance'
        }
      );

      if (!user) {
        throw new Error('Utilisateur non trouvé');
      }

      // Récupérer des statistiques supplémentaires
      const missionsStats = await this.getUserMissionsStats(userId);
      const ordersStats = await this.getUserOrdersStats(userId);
      const revenueStats = await this.getUserRevenueStats(userId);

      const stats = {
        profile: {
          completed_missions: user.completed_missions || 0,
          completed_orders: user.completed_orders || 0,
          rating: user.rating || 0,
          response_rate: user.response_rate || 0,
          balance: user.balance || 0
        },
        missions: missionsStats,
        orders: ordersStats,
        revenue: revenueStats
      };

      return Response.success(stats, 'Statistiques utilisateur récupérées');

    } catch (err) {
      const handledError = Error.handleServiceError(err, 'UserService.getUserStats', { userId });
      return Response.error(handledError.message);
    }
  }

  async getUserMissionsStats(userId) {
    try {
      const { data: missions, error } = await database.client
        .from('missions')
        .select('status, budget')
        .eq('buyer_id', userId);

      if (error) throw error;

      return {
        total: missions?.length || 0,
        completed: missions?.filter(m => m.status === 'completed').length || 0,
        total_budget: missions?.reduce((sum, m) => sum + (m.budget || 0), 0) || 0
      };

    } catch (error) {
      logger.error('Erreur calcul stats missions utilisateur', { userId, error: error.message });
      return { total: 0, completed: 0, total_budget: 0 };
    }
  }

  async getUserOrdersStats(userId) {
    try {
      const { data: orders, error } = await database.client
        .from('orders')
        .select('status, amount')
        .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);

      if (error) throw error;

      const buyerOrders = orders?.filter(o => o.buyer_id === userId) || [];
      const sellerOrders = orders?.filter(o => o.seller_id === userId) || [];

      return {
        total: orders?.length || 0,
        as_buyer: buyerOrders.length,
        as_seller: sellerOrders.length,
        total_spent: buyerOrders.reduce((sum, o) => sum + (o.amount || 0), 0),
        total_earned: sellerOrders.reduce((sum, o) => sum + (o.amount || 0), 0)
      };

    } catch (error) {
      logger.error('Erreur calcul stats commandes utilisateur', { userId, error: error.message });
      return { total: 0, as_buyer: 0, as_seller: 0, total_spent: 0, total_earned: 0 };
    }
  }

  async getUserRevenueStats(userId) {
    try {
      const { data: transactions, error } = await database.client
        .from('wallet_transactions')
        .select('amount, type')
        .eq('user_id', userId)
        .eq('status', 'completed');

      if (error) throw error;

      const credits = transactions?.filter(t => t.type === 'credit') || [];
      const debits = transactions?.filter(t => t.type === 'debit') || [];

      return {
        total_revenue: credits.reduce((sum, t) => sum + (t.amount || 0), 0),
        total_withdrawals: debits.reduce((sum, t) => sum + (t.amount || 0), 0),
        transaction_count: transactions?.length || 0
      };

    } catch (error) {
      logger.error('Erreur calcul stats revenus utilisateur', { userId, error: error.message });
      return { total_revenue: 0, total_withdrawals: 0, transaction_count: 0 };
    }
  }
}

module.exports = new UserService();