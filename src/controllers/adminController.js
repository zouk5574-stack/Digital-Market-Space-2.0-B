const Joi = require('joi');
const { supabase } = require('../config/supabase');
const { logAction } = require('../utils/logger');

const adminValidation = {
  getUsers: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    role: Joi.string().valid('buyer', 'seller', 'admin'),
    status: Joi.string().valid('active', 'suspended', 'pending')
  }),
  updateUser: Joi.object({
    role: Joi.string().valid('buyer', 'seller', 'admin'),
    status: Joi.string().valid('active', 'suspended', 'pending'),
    email_verified: Joi.boolean()
  }),
  platformStats: Joi.object({
    start_date: Joi.date().optional(),
    end_date: Joi.date().optional()
  })
};

exports.getUsers = async (req, res) => {
  try {
    const { error, value } = adminValidation.getUsers.validate(req.query);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { page, limit, role, status } = value;
    const startIndex = (page - 1) * limit;

    let query = supabase
      .from('users')
      .select(`
        *,
        shops:shops(*),
        wallets:wallets(*)
      `, { count: 'exact' });

    if (role) query = query.eq('role', role);
    if (status) query = query.eq('status', status);

    const { data: users, error: dbError, count } = await query
      .range(startIndex, startIndex + limit - 1)
      .order('created_at', { ascending: false });

    if (dbError) throw dbError;

    await logAction(req.user.id, 'ADMIN_VIEW_USERS', { page, limit, filters: { role, status } });

    res.json({
      success: true,
      data: users,
      pagination: {
        current_page: page,
        total_pages: Math.ceil(count / limit),
        total_items: count,
        items_per_page: limit
      }
    });
  } catch (error) {
    console.error('Admin getUsers error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des utilisateurs' });
  }
};

exports.getPlatformStats = async (req, res) => {
  try {
    const { error, value } = adminValidation.platformStats.validate(req.query);
    if (error) return res.status(400).json({ error: error.details[0].message });

    const { start_date, end_date } = value;

    // Statistiques utilisateurs
    const { data: userStats, error: userError } = await supabase
      .from('users')
      .select('role, status', { count: 'exact', head: true });

    if (userError) throw userError;

    // Statistiques produits
    const { data: productStats, error: productError } = await supabase
      .from('products')
      .select('status', { count: 'exact', head: true });

    if (productError) throw productError;

    // Statistiques commandes
    let orderQuery = supabase
      .from('orders')
      .select('total_amount, status', { count: 'exact' });

    if (start_date && end_date) {
      orderQuery = orderQuery.gte('created_at', start_date).lte('created_at', end_date);
    }

    const { data: orders, error: orderError } = await orderQuery;
    if (orderError) throw orderError;

    const revenue = orders
      .filter(order => order.status === 'completed')
      .reduce((sum, order) => sum + parseFloat(order.total_amount || 0), 0);

    const stats = {
      users: {
        total: userStats.length,
        buyers: userStats.filter(u => u.role === 'buyer').length,
        sellers: userStats.filter(u => u.role === 'seller').length,
        admins: userStats.filter(u => u.role === 'admin').length
      },
      products: {
        total: productStats.length,
        active: productStats.filter(p => p.status === 'active').length,
        draft: productStats.filter(p => p.status === 'draft').length
      },
      orders: {
        total: orders.length,
        completed: orders.filter(o => o.status === 'completed').length,
        pending: orders.filter(o => o.status === 'pending').length,
        revenue: revenue
      },
      financial: {
        total_revenue: revenue,
        pending_withdrawals: 0, // À implémenter
        completed_payouts: 0 // À implémenter
      }
    };

    await logAction(req.user.id, 'ADMIN_VIEW_STATS', { start_date, end_date });

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des statistiques' });
  }
};

exports.updateUserStatus = async (req, res) => {
  try {
    const { error: paramError } = Joi.object({
      userId: Joi.string().uuid().required()
    }).validate(req.params);
    if (paramError) return res.status(400).json({ error: paramError.details[0].message });

    const { error: bodyError, value } = adminValidation.updateUser.validate(req.body);
    if (bodyError) return res.status(400).json({ error: bodyError.details[0].message });

    const { userId } = req.params;

    // Vérifier que l'utilisateur existe
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    // Mettre à jour l'utilisateur
    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update(value)
      .eq('id', userId)
      .select()
      .single();

    if (updateError) throw updateError;

    await logAction(req.user.id, 'ADMIN_UPDATE_USER', { 
      target_user_id: userId, 
      updates: value,
      previous_status: user.status,
      previous_role: user.role
    });

    res.json({ 
      success: true, 
      message: 'Utilisateur mis à jour avec succès',
      data: updatedUser 
    });
  } catch (error) {
    console.error('Admin update user error:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour de l\'utilisateur' });
  }
};
