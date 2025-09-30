// controllers/statsController.js
import { supabase } from "../server.js";

// ✅ Récupérer toutes les stats admin
export async function getAdminStats(req, res) {
  try {
    // Vérifier si admin
    if (!req.user.is_super_admin) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    // Total users
    const { count: userCount } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true });

    // Total products
    const { count: productCount } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true });

    // Total orders
    const { count: orderCount } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true });

    // Total payments confirmés
    const { data: payments } = await supabase
      .from("payments")
      .select("amount, status");

    const confirmedPayments = payments?.filter(p => p.status === "confirmed") || [];
    const totalRevenue = confirmedPayments.reduce((sum, p) => sum + p.amount, 0);

    // Withdrawals en attente
    const { count: pendingWithdrawals } = await supabase
      .from("withdrawals")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    // Litiges ouverts
    const { count: openDisputes } = await supabase
      .from("disputes")
      .select("*", { count: "exact", head: true })
      .eq("status", "open");

    return res.json({
      users: userCount || 0,
      products: productCount || 0,
      orders: orderCount || 0,
      revenue: totalRevenue,
      pendingWithdrawals: pendingWithdrawals || 0,
      openDisputes: openDisputes || 0
    });
  } catch (err) {
    console.error("Get stats error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
}
