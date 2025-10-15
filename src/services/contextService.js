// src/services/contextService.js
import { supabase } from "../server.js";

export const contextService = {
  async buildUserContext(user, additionalContext = {}) {
    try {
      // Récupérer les données utilisateur SANS informations sensibles
      const userData = await this.getUserData(user.id);
      const userRole = this.determineUserRole(userData);
      
      // Compter les activités (limité par rôle)
      const activities = await this.getUserActivities(user.id, userRole);
      
      // Récupérer les paramètres plateforme (filtrés par rôle)
      const platformContext = await this.getPlatformContext(userRole);
      
      return {
        userId: user.id,
        userRole: userRole,
        userData: await this.getSafeUserData(userData, userRole, activities),
        platformContext: platformContext,
        activities: activities,
        ...additionalContext
      };
    } catch (error) {
      console.error("Context build error:", error);
      return this.getFallbackContext(user);
    }
  },

  async getUserData(userId) {
    const { data: userData, error } = await supabase
      .from('users')
      .select(`
        id,
        username,
        email,
        firstname,
        lastname,
        is_super_admin,
        roles(name),
        wallets(balance),
        created_at
      `)
      .eq('id', userId)
      .single();

    if (error) throw error;
    return userData;
  },

  async getUserActivities(userId, userRole) {
    // Les admins ne voient pas leurs stats personnelles
    if (userRole === 'ADMIN') {
      return { orderCount: 0, productCount: 0, missionCount: 0 };
    }

    // Récupération normale pour vendeurs/acheteurs
    const { count: orderCount } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('buyer_id', userId);

    const { count: productCount } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', userId);

    const { count: missionCount } = await supabase
      .from('freelance_missions')
      .select('*', { count: 'exact', head: true })
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);

    return { orderCount, productCount, missionCount };
  },

  async getPlatformContext(userRole) {
    // Paramètres publics pour tous
    const publicSettings = {
      commission_rate: '10%',
      withdrawal_process: '48h',
      min_withdrawal: 1000
    };

    // Paramètres admin SEULEMENT pour les admins
    if (userRole === 'ADMIN') {
      const { data: adminSettings } = await supabase
        .from('settings')
        .select('key, value')
        .in('key', ['shop_limit', 'max_commission', 'system_status']);
      
      // Fusionner avec les settings publics
      return { ...publicSettings, ...this.parseAdminSettings(adminSettings) };
    }

    return publicSettings;
  },

  parseAdminSettings(settings) {
    if (!settings) return {};
    
    return settings.reduce((acc, setting) => {
      acc[setting.key] = setting.value;
      return acc;
    }, {});
  },

  async getSafeUserData(userData, userRole, activities) {
    const baseData = {
      joinCount: activities.orderCount + activities.productCount + activities.missionCount,
      isActive: (activities.orderCount + activities.productCount + activities.missionCount) > 0,
      email: userData.email,
      username: userData.username
    };

    // Ajouter des données spécifiques selon le rôle
    if (userRole === 'VENDEUR') {
      const { count: shopsCount } = await supabase
        .from('shops')
        .select('*', { count: 'exact', head: true })
        .eq('owner_id', userData.id);
        
      return {
        ...baseData,
        balance: userData.wallets?.balance || 0,
        shopCount: shopsCount || 0
      };
    }

    if (userRole === 'ACHETEUR') {
      return {
        ...baseData,
        balance: userData.wallets?.balance || 0
      };
    }

    // ADMIN - données minimales
    return {
      ...baseData,
      balance: 0,
      shopCount: 0
    };
  },

  determineUserRole(userData) {
    if (userData.is_super_admin) return 'ADMIN';
    if (userData.roles?.name === 'seller') return 'VENDEUR';
    return 'ACHETEUR';
  },

  getFallbackContext(user) {
    return {
      userId: user.id,
      userRole: 'ACHETEUR',
      userData: {
        joinCount: 0,
        isActive: false,
        balance: 0,
        shopCount: 0,
        email: user.email,
        username: user.username
      },
      platformContext: {
        commission_rate: '10%',
        withdrawal_process: '48h',
        min_withdrawal: 1000
      },
      activities: { orderCount: 0, productCount: 0, missionCount: 0 }
    };
  }
};
