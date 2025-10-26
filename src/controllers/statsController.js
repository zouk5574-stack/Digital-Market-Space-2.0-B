const Joi = require('joi');
const { supabase } = require('../config/supabase');

const statsValidation = {
  getDashboardStats: Joi.object({
    period: Joi.string().valid('day', 'week', 'month', 'year').default('month')
  }),
  getSalesAnalytics: Joi.object({
    start_date: Joi.date().required(),
    end_date: Joi.date().required(),
    group_by: Joi.string().valid('day', 'week', 'month').default('day')
  })
};

// Cache simple en mémoire (à remplacer par Redis en production)
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

exports.getDashboardStats = async (req, res) => {
  try {
    const { error, value } = statsValidation.getDashboardStats.validate(req.query);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { period } = value;
    const cacheKey = `dashboard_${req.user.id}_${period}`;
    
    // Vérifier le cache
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.json({ success: true, data: cached.data, cached: true });
    }

    const userId = req.user.id;
    const userRole = req.user.role;

    let stats = {};

    if (userRole === 'seller') {
      // Stats pour vendeur
      const shopQuery = await supabase
        .from('shops')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (shopQuery.data) {
        const shopId = shopQuery.data.id;

        // Produits
        const { data: products, error: productsError } = await supabase
          .from('products')
          .select('id, status, price')
          .eq('shop_id', shopId);

        if (!productsError) {
          stats.products = {
            total: products.length,
            active: products.filter(p => p.status === 'active').length,
            draft: products.filter(p => p.status === 'draft').length
          };
        }

        // Commandes et revenus
        const { data: orders, error: ordersError } = await supabase
          .from('order_items')
          .select(`
            quantity, price,
            orders!inner(status, created_at)
          `)
          .eq('product_id', supabase.from('products').select('id').eq('shop_id', shopId));

        if (!ordersError) {
          const completedOrders = orders.filter(item => item.orders.status === 'completed');
          const revenue = completedOrders.reduce((sum, item) => sum + (item.price * item.quantity), 0);
          
          stats.orders = {
            total: orders.length,
            completed: completedOrders.length,
            revenue: revenue
          };
        }
      }
    } else if (userRole === 'buyer') {
      // Stats pour acheteur
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('*')
        .eq('user_id', userId);

      if (!ordersError) {
        stats.orders = {
          total: orders.length,
          completed: orders.filter(o => o.status === 'completed').length,
          pending: orders.filter(o => o.status === 'pending').length
        };
      }
    }

    // Stats communes
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', userId)
      .single();

    if (!walletError) {
      stats.wallet = {
        balance: wallet.balance
      };
    }

    // Mettre en cache
    cache.set(cacheKey, {
      data: stats,
      timestamp: Date.now()
    });

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des statistiques' });
  }
};

exports.getSalesAnalytics = async (req, res) => {
  try {
    const { error, value } = statsValidation.getSalesAnalytics.validate(req.query);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { start_date, end_date, group_by } = value;
    const userId = req.user.id;

    // Implémentation de l'analyse des ventes
    // Cette fonction nécessite des vues SQL ou des requêtes complexes
    // Voici un exemple basique :

    let query = supabase
      .from('orders')
      .select('created_at, total_amount, status')
      .eq('user_id', userId)
      .gte('created_at', start_date)
      .lte('created_at', end_date)
      .order('created_at', { ascending: true });

    const { data: orders, error: ordersError } = await query;
    
    if (ordersError) throw ordersError;

    // Grouper les données selon la période
    const groupedData = groupSalesData(orders, group_by);

    res.json({ 
      success: true, 
      data: {
        period: { start_date, end_date, group_by },
        analytics: groupedData
      }
    });
  } catch (error) {
    console.error('Sales analytics error:', error);
    res.status(500).json({ error: 'Erreur lors de l\'analyse des ventes' });
  }
};

function groupSalesData(orders, groupBy) {
  const groups = {};
  
  orders.forEach(order => {
    const date = new Date(order.created_at);
    let key;
    
    switch (groupBy) {
      case 'day':
        key = date.toISOString().split('T')[0];
        break;
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split('T')[0];
        break;
      case 'month':
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        break;
    }
    
    if (!groups[key]) {
      groups[key] = {
        date: key,
        total_orders: 0,
        completed_orders: 0,
        revenue: 0
      };
    }
    
    groups[key].total_orders++;
    if (order.status === 'completed') {
      groups[key].completed_orders++;
      groups[key].revenue += parseFloat(order.total_amount || 0);
    }
  });
  
  return Object.values(groups);
    }
