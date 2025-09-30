// controllers/statsController.js
import { supabase } from "../server.js";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

// ✅ Stats complètes (dashboard admin)
export async function getAdminStats(req, res) {
  try {
    if (!req.user?.is_super_admin) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    // Total users
    const { count: userCount, error: userError } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true });

    // Total products
    const { count: productCount, error: productError } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true });

    // Total orders
    const { count: orderCount, error: orderError } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true });

    // Total payments confirmés
    const { data: payments, error: paymentError } = await supabase
      .from("payments")
      .select("amount, status");

    const confirmedPayments =
      payments?.filter((p) => p.status === "confirmed") || [];
    const totalRevenue = confirmedPayments.reduce(
      (sum, p) => sum + Number(p.amount),
      0
    );

    // Withdrawals en attente
    const { count: pendingWithdrawals, error: withdrawalError } = await supabase
      .from("withdrawals")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    // Litiges ouverts
    const { count: openDisputes, error: disputeError } = await supabase
      .from("disputes")
      .select("*", { count: "exact", head: true })
      .eq("status", "open");

    if (
      userError ||
      productError ||
      orderError ||
      paymentError ||
      withdrawalError ||
      disputeError
    ) {
      throw (
        userError ||
        productError ||
        orderError ||
        paymentError ||
        withdrawalError ||
        disputeError
      );
    }

    return res.json({
      users: userCount || 0,
      products: productCount || 0,
      orders: orderCount || 0,
      revenue: totalRevenue,
      pendingWithdrawals: pendingWithdrawals || 0,
      openDisputes: openDisputes || 0,
    });
  } catch (err) {
    console.error("Get admin stats error:", err);
    return res
      .status(500)
      .json({ error: "Erreur serveur", details: err.message });
  }
}

// ✅ Stats financières générales
export async function getStats(req, res) {
  try {
    if (!req.user?.is_super_admin) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    const [orders, users, withdrawals] = await Promise.all([
      supabase.from("orders").select("total_price, commission, status"),
      supabase.from("users").select("id"),
      supabase.from("withdrawals").select("amount, status"),
    ]);

    if (orders.error || users.error || withdrawals.error) {
      throw orders.error || users.error || withdrawals.error;
    }

    const totalSales = orders.data.reduce(
      (sum, o) => sum + Number(o.total_price || 0),
      0
    );
    const totalCommissions = orders.data.reduce(
      (sum, o) => sum + Number(o.commission || 0),
      0
    );
    const totalUsers = users.data.length;
    const totalWithdrawals = withdrawals.data.reduce(
      (sum, w) => sum + Number(w.amount || 0),
      0
    );

    return res.json({
      totalSales,
      totalCommissions,
      totalUsers,
      totalWithdrawals,
      ordersCount: orders.data.length,
      withdrawalsCount: withdrawals.data.length,
    });
  } catch (err) {
    console.error("Get stats error:", err);
    return res
      .status(500)
      .json({ error: "Erreur serveur", details: err.message });
  }
}

// ✅ Export Excel
export async function exportStatsExcel(req, res) {
  try {
    if (!req.user?.is_super_admin) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    // Récup stats
    const { data: orders } = await supabase
      .from("orders")
      .select("id,total_price,commission,status,created_at");
    const { data: users } = await supabase
      .from("users")
      .select("id,email,created_at");
    const { data: withdrawals } = await supabase
      .from("withdrawals")
      .select("id,amount,status,created_at");

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Stats");

    // En-têtes
    sheet.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "Type", key: "type", width: 15 },
      { header: "Montant", key: "amount", width: 15 },
      { header: "Statut", key: "status", width: 15 },
      { header: "Date", key: "date", width: 20 },
    ];

    // Ajouter commandes
    orders?.forEach((o) => {
      sheet.addRow({
        id: o.id,
        type: "Commande",
        amount: o.total_price,
        status: o.status,
        date: o.created_at,
      });
    });

    // Ajouter retraits
    withdrawals?.forEach((w) => {
      sheet.addRow({
        id: w.id,
        type: "Retrait",
        amount: w.amount,
        status: w.status,
        date: w.created_at,
      });
    });

    // Ajouter utilisateurs
    users?.forEach((u) => {
      sheet.addRow({
        id: u.id,
        type: "Utilisateur",
        amount: "-",
        status: "-",
        date: u.created_at,
      });
    });

    // Envoi fichier Excel
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=stats.xlsx");

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Export Excel error:", err);
    return res
      .status(500)
      .json({ error: "Erreur export Excel", details: err.message });
  }
}

// ✅ Export PDF
export async function exportStatsPDF(req, res) {
  try {
    if (!req.user?.is_super_admin) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    const { data: orders } = await supabase.from("orders").select(
      "id,total_price,status,created_at"
    );

    const doc = new PDFDocument();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=stats.pdf");

    doc.pipe(res);

    doc
      .fontSize(18)
      .text("Rapport Statistiques Digital Market Space", { align: "center" });
    doc.moveDown();

    doc.fontSize(14).text("📊 Commandes :", { underline: true });
    orders?.forEach((o) => {
      doc
        .fontSize(12)
        .text(
          `- ID: ${o.id}, Montant: ${o.total_price} CFA, Statut: ${o.status}, Date: ${o.created_at}`
        );
    });

    doc.end();
  } catch (err) {
    console.error("Export PDF error:", err);
    return res
      .status(500)
      .json({ error: "Erreur export PDF", details: err.message });
  }
      }
