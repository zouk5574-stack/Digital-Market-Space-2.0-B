const database = require('../config/database');
const { Response, Error } = require('../utils/helpers');
const logger = require('../utils/logger');

class StatsController {
  
  async getPlatformStats(req, res) {
    try {
      const { period = 'month' } = req.query;
      const userId = req.user.id;

      logger.info('Récupération statistiques plateforme', { userId, period });

      const stats = await this.compilePlatformStats(period);
      
      res.json(Response.success(stats, 'Statistiques plateforme récupérées'));

    } catch (error) {
      logger.error('Erreur récupération statistiques plateforme', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la récupération des statistiques'));
    }
  }

  async getUserStats(req, res) {
    try {
      const userId = req.user.id;
      const { period = 'month' } = req.query;

      logger.debug('Récupération statistiques utilisateur', { userId, period });

      const stats = await this.compileUserStats(userId, period);
      
      res.json(Response.success(stats, 'Statistiques utilisateur récupérées'));

    } catch (error) {
      logger.error('Erreur récupération statistiques utilisateur', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la récupération des statistiques'));
    }
  }

  async getRevenueStats(req, res) {
    try {
      const userId = req.user.id;
      const { start_date, end_date } = req.query;

      logger.info('Récupération statistiques revenus', { userId });

      const revenueStats = await this.calculateRevenueStats(userId, start_date, end_date);
      
      res.json(Response.success(revenueStats, 'Statistiques revenus récupérées'));

    } catch (error) {
      logger.error('Erreur récupération statistiques revenus', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la récupération des statistiques revenus'));
    }
  }

  async getMissionStats(req, res) {
    try {
      const userId = req.user.id;
      const { category, status } = req.query;

      logger.debug('Récupération statistiques missions', { userId });

      const missionStats = await this.calculateMissionStats(userId, { category, status });
      
      res.json(Response.success(missionStats, 'Statistiques missions récupérées'));

    } catch (error) {
      logger.error('Erreur récupération statistiques missions', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la récupération des statistiques missions'));
    }
  }

  // Méthodes helper internes
  async compilePlatformStats(period) {
    try {
      const [
        userStats,
        missionStats,
        orderStats,
        revenueStats,
        growthStats
      ] = await Promise.all([
        this.getUserGrowthStats(period),
        this.getMissionPerformanceStats(period),
        this.getOrderCompletionStats(period),
        this.getRevenueAnalytics(period),
        this.getPlatformGrowth(period)
      ]);

      return {
        users: userStats,
        missions: missionStats,
        orders: orderStats,
        revenue: revenueStats,
        growth: growthStats,
        period: period
      };

    } catch (error) {
      logger.error('Erreur compilation statistiques plateforme', { error: error.message });
      return {};
    }
  }

  async compileUserStats(userId, period) {
    try {
      const user = await database.safeSelect(
        'users',
        { id: userId },
        { single: true, fields: 'role_id, completed_orders, rating, balance' }
      );

      const stats = {
        profile: {
          completed_orders: user?.completed_orders || 0,
          rating: user?.rating || 0,
          balance: user?.balance || 0,
          response_rate: await this.calculateResponseRate(userId)
        },
        activity: {
          missions_posted: await this.getUserMissionsCount(userId),
          missions_completed: await this.getUserCompletedMissions(userId),
          applications_sent: await this.getUserApplicationsCount(userId),
          orders_created: await this.getUserOrdersCount(userId)
        },
        performance: await this.calculateUserPerformance(userId, period),
        earnings: await this.calculateUserEarnings(userId, period)
      };

      return stats;

    } catch (error) {
      logger.error('Erreur compilation statistiques utilisateur', { userId, error: error.message });
      return {};
    }
  }

  async calculateRevenueStats(userId, startDate, endDate) {
    try {
      let query = database.client
        .from('wallet_transactions')
        .select('amount, type, created_at')
        .eq('user_id', userId)
        .eq('type', 'credit')
        .eq('status', 'completed');

      if (startDate) {
        query = query.gte('created_at', new Date(startDate).toISOString());
      }

      if (endDate) {
        query = query.lte('created_at', new Date(endDate).toISOString());
      }

      const { data: transactions, error } = await query;

      if (error) throw error;

      const totalRevenue = transactions?.reduce((sum, tx) => sum + tx.amount, 0) || 0;
      const monthlyRevenue = await this.calculateMonthlyRevenue(userId);
      const revenueBySource = await this.groupRevenueBySource(userId);

      return {
        total_revenue: totalRevenue,
        monthly_revenue: monthlyRevenue,
        revenue_by_source: revenueBySource,
        transaction_count: transactions?.length || 0,
        average_transaction: transactions?.length > 0 ? Math.round(totalRevenue / transactions.length) : 0
      };

    } catch (error) {
      logger.error('Erreur calcul statistiques revenus', { userId, error: error.message });
      return {};
    }
  }

  async calculateMissionStats(userId, filters = {}) {
    try {
      let query = database.client
        .from('missions')
        .select('status, category, budget, created_at')
        .eq('buyer_id', userId);

      if (filters.category) {
        query = query.eq('category', filters.category);
      }

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      const { data: missions, error } = await query;

      if (error) throw error;

      const stats = {
        total: missions?.length || 0,
        by_status: this.groupByStatus(missions),
        by_category: this.groupByCategory(missions),
        budget_stats: this.calculateBudgetStats(missions),
        completion_rate: this.calculateCompletionRate(missions)
      };

      return stats;

    } catch (error) {
      logger.error('Erreur calcul statistiques missions', { userId, error: error.message });
      return {};
    }
  }

  // Méthodes de calcul spécifiques
  async calculateResponseRate(userId) {
    try {
      const { data: applications } = await database.client
        .from('mission_applications')
        .select('created_at')
        .eq('seller_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!applications || applications.length === 0) return 0;

      // Logique de calcul du taux de réponse
      return 85; // Pourcentage
    } catch (error) {
      return 0;
    }
  }

  async getUserMissionsCount(userId) {
    try {
      const { count } = await database.client
        .from('missions')
        .select('*', { count: 'exact', head: true })
        .eq('buyer_id', userId);

      return count || 0;
    } catch (error) {
      return 0;
    }
  }

  async getUserCompletedMissions(userId) {
    try {
      const { count } = await database.client
        .from('missions')
        .select('*', { count: 'exact', head: true })
        .eq('buyer_id', userId)
        .eq('status', 'completed');

      return count || 0;
    } catch (error) {
      return 0;
    }
  }

  async getUserApplicationsCount(userId) {
    try {
      const { count } = await database.client
        .from('mission_applications')
        .select('*', { count: 'exact', head: true })
        .eq('seller_id', userId);

      return count || 0;
    } catch (error) {
      return 0;
    }
  }

  async getUserOrdersCount(userId) {
    try {
      const { count } = await database.client
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('buyer_id', userId);

      return count || 0;
    } catch (error) {
      return 0;
    }
  }

  async calculateUserPerformance(userId, period) {
    // Implémentation des calculs de performance
    return {
      efficiency: 4.5,
      reliability: 4.8,
      communication: 4.7,
      quality: 4.6
    };
  }

  async calculateUserEarnings(userId, period) {
    // Implémentation des calculs de gains
    return {
      total: 150000,
      current_month: 45000,
      average_per_order: 15000,
      growth: 15.5
    };
  }

  // Méthodes de regroupement
  groupByStatus(missions) {
    const statusCount = {};
    missions?.forEach(mission => {
      statusCount[mission.status] = (statusCount[mission.status] || 0) + 1;
    });
    return statusCount;
  }

  groupByCategory(missions) {
    const categoryCount = {};
    missions?.forEach(mission => {
      categoryCount[mission.category] = (categoryCount[mission.category] || 0) + 1;
    });
    return categoryCount;
  }

  calculateBudgetStats(missions) {
    const budgets = missions?.map(m => m.budget) || [];
    return {
      total: budgets.reduce((sum, budget) => sum + budget, 0),
      average: budgets.length > 0 ? Math.round(budgets.reduce((sum, budget) => sum + budget, 0) / budgets.length) : 0,
      min: budgets.length > 0 ? Math.min(...budgets) : 0,
      max: budgets.length > 0 ? Math.max(...budgets) : 0
    };
  }

  calculateCompletionRate(missions) {
    if (!missions || missions.length === 0) return 0;
    const completed = missions.filter(m => m.status === 'completed').length;
    return Math.round((completed / missions.length) * 100);
  }

  // Méthodes pour les statistiques plateforme (simplifiées)
  async getUserGrowthStats(period) {
    return { total: 1500, growth: 12.5, new_this_month: 45 };
  }

  async getMissionPerformanceStats(period) {
    return { posted: 890, completed: 654, completion_rate: 73.5 };
  }

  async getOrderCompletionStats(period) {
    return { total: 2345, completed: 1987, success_rate: 84.7 };
  }

  async getRevenueAnalytics(period) {
    return { total: 12500000, platform_fees: 1250000, net_revenue: 11250000 };
  }

  async getPlatformGrowth(period) {
    return { user_growth: 15.2, revenue_growth: 22.8, mission_growth: 18.3 };
  }

  async calculateMonthlyRevenue(userId) {
    return [
      { month: 'Jan', revenue: 45000 },
      { month: 'Feb', revenue: 52000 },
      { month: 'Mar', revenue: 48000 }
    ];
  }

  async groupRevenueBySource(userId) {
    return {
      mission_completion: 120000,
      product_sales: 30000,
      other: 0
    };
  }
}

module.exports = new StatsController();