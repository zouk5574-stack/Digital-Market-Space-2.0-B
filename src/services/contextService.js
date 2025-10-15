// src/services/contextService.js
import { supabase } from "../server.js";

export const contextService = {
  async buildUserContext(user, additionalContext = {}) {
    // Récupérer les données utilisateur
    const userStats = await this.getUserStats(user.id);
    const platformContext = await this.getPlatformContext();
    
    return {
      userId: user.id,
      userRole: user.role,
      userData: {
        joinDate: user.created_at,
        orderCount: userStats.orderCount,
        salesCount: userStats.salesCount,
        missionCount: userStats.missionCount,
        isActive: userStats.isActive
      },
      platformContext: {
        commissionRate: 10, // 10%
        shopLimit: 3,
        withdrawalProcess: "Fedapay",
        supportEmail: "support@digitalmarket.com"
      },
      currentContext: additionalContext,
      timestamp: new Date().toISOString()
    };
  },

  async getUserStats(userId) {
    const [
      ordersCount,
      salesCount, 
      missionsCount,
      recentActivity
    ] = await Promise.all([
      this.getUserOrdersCount(userId),
      this.getUserSalesCount(userId),
      this.getUserMissionsCount(userId),
      this.getUserRecentActivity(userId)
    ]);

    return {
      orderCount: ordersCount,
      salesCount: salesCount,
      missionCount: missionsCount,
      isActive: recentActivity > 0
    };
  },

  async getUserOrdersCount(userId) {
    const { count } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("buyer_id", userId);
    
    return count || 0;
  },

  async getUserSalesCount(userId) {
    const { count } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("seller_id", userId);
    
    return count || 0;
  },

  async getUserMissionsCount(userId) {
    const { count } = await supabase
      .from("freelance_missions")
      .select("*", { count: "exact", head: true })
      .eq("buyer_id", userId);
    
    return count || 0;
  },

  async getUserRecentActivity(userId) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { count } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("buyer_id", userId)
      .gte("created_at", thirtyDaysAgo.toISOString());

    return count || 0;
  },

  async getPlatformContext() {
    // Récupérer les stats globales de la plateforme
    const [
      totalUsers,
      totalProducts,
      totalOrders
    ] = await Promise.all([
      supabase.from("users").select("*", { count: "exact", head: true }),
      supabase.from("products").select("*", { count: "exact", head: true }),
      supabase.from("orders").select("*", { count: "exact", head: true })
    ]);

    return {
      totalUsers: totalUsers.count || 0,
      totalProducts: totalProducts.count || 0,
      totalOrders: totalOrders.count || 0
    };
  }
};
