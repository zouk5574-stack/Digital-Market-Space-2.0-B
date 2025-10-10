// src/controllers/statsController.js (FINALISÉ)

import { supabase } from "../server.js";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

// =====================================
// 1. Stats Complètes (Dashboard ADMIN)
// =====================================
export async function getAdminStats(req, res) {
  try {
    // ⚠️ La vérification des droits d'ADMIN est faite par le middleware requireRole

    // Total users
    const userCountPromise = supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .then(res => res.count);

    // Total products
    const productCountPromise = supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .then(res => res.count);

    // Total orders
    const orderCountPromise = supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .then(res => res.count);

    // Total paiements confirmés (Revenue brut total) & Commissions (Revenu net plateforme)
    // ➡️ COHÉRENCE : Utilisation de la table 'orders' pour les commandes complétées
    const completedOrdersPromise = supabase
      .from("orders")
      .select("total_price, commission")
      .eq("status", "completed")
      .then(res => res.data);

    // Withdrawals en attente
    const pendingWithdrawalsPromise = supabase
      .from("withdrawals")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending")
      .then(res => res.count);

    // Litiges ouverts
    const openDisputesPromise = supabase
      .from("disputes")
      .select("*", { count: "exact", head: true })
      .eq("status", "open")
      .then(res => res.count);

    const [
        userCount, 
        productCount, 
        orderCount, 
        completedOrders, 
        pendingWithdrawals, 
        openDisputes
    ] = await Promise.all([
        userCountPromise, 
        productCountPromise, 
        orderCountPromise, 
        completedOrdersPromise, 
        pendingWithdrawalsPromise, 
        openDisputesPromise
    ]);

    // Calcul de la Revenue Brute Totale (valeur de toutes les ventes)
    const totalGrossRevenue = completedOrders?.reduce(
      (sum, o) => sum + Number(o.total_price || 0),
      0
    ) || 0;
    
    // Calcul de la Commission Totale (Revenu NET de la plateforme)
    const totalNetCommission = completedOrders?.reduce(
      (sum, o) => sum + Number(o.commission || 0),
      0
    ) || 0;


    return res.json({
      success: true,
      stats: {
          users: userCount || 0,
          products: productCount || 0,
          orders: orderCount || 0,
          totalGrossRevenue: totalGrossRevenue, // Toutes les ventes complétées
          totalNetCommission: totalNetCommission, // Revenue de la plateforme
          pendingWithdrawals: pendingWithdrawals || 0,
          openDisputes: openDisputes || 0,
      }
    });
  } catch (err) {
    console.error("Get admin stats error:", err);
    return res
      .status(500)
      .json({ error: "Erreur serveur", details: err.message });
  }
}

// ------------------------------------
// 2. Stats Utilisateur (Mes stats)
// ------------------------------------
export async function getStats(req, res) {
  try {
    const userId = req.user.db.id; 

    // Stats 1: Mes Ventes (Commandes pour mes produits)
    const salesPromise = supabase
        .from("orders")
        .select("total_price, commission, seller_earning, status") // Ajout de seller_earning
        .eq("seller_id", userId);

    // Stats 2: Mes Achats (Commandes que j'ai passées)
    const purchasesPromise = supabase
        .from("orders")
        .select("total_price, status")
        .eq("buyer_id", userId);

    // Stats 3: Mon Portefeuille (Solde actuel)
    const walletBalancePromise = supabase
        .from("wallets")
        .select("balance")
        .eq("user_id", userId)
        .single()
        .then(res => res.data?.balance || 0);


    const [salesResult, purchasesResult, walletBalance] = await Promise.all([
        salesPromise, 
        purchasesPromise, 
        walletBalancePromise
    ]);

    if (salesResult.error || purchasesResult.error) {
        throw salesResult.error || purchasesResult.error;
    }

    const completedSales = salesResult.data?.filter(o => o.status === 'completed') || [];
    const successfulPurchases = purchasesResult.data?.filter(o => o.status === 'completed') || [];

    const totalSalesRevenue = completedSales.reduce(
        (sum, o) => sum + Number(o.total_price || 0), 0
    );
    // ➡️ Correction : Total des GAINS du vendeur (seller_earning)
    const totalSellerEarnings = completedSales.reduce(
        (sum, o) => sum + Number(o.seller_earning || 0), 0
    );

    return res.json({
      success: true,
      stats: {
          walletBalance: walletBalance,
          salesCount: salesResult.data?.length || 0,
          totalSalesRevenue: totalSalesRevenue, // Valeur brute de ce que j'ai vendu
          totalSellerEarnings: totalSellerEarnings, // Mon revenu net après commission
          purchasesCount: purchasesResult.data?.length || 0,
          successfulPurchasesCount: successfulPurchases.length,
      }
    });

  } catch (err) {
    console.error("Get user stats error:", err);
    return res
      .status(500)
      .json({ error: "Erreur serveur", details: err.message });
  }
}

// ------------------------------------
// 3. Export Excel (Admin)
// ------------------------------------
export async function exportStatsExcel(req, res) {
  try {
    // ⚠️ La vérification des droits d'ADMIN est faite par le middleware requireRole

    // Récup stats complètes 
    const [ordersRes, usersRes, withdrawalsRes] = await Promise.all([
        supabase.from("orders").select("id,total_price,commission,seller_earning,status,created_at, buyer_id, seller_id"),
        supabase.from("users").select("id,username,email,role,created_at"),
        supabase.from("withdrawals").select("id,amount,status,created_at, user_id"),
    ]);

    const orders = ordersRes.data || [];
    const users = usersRes.data || [];
    const withdrawals = withdrawalsRes.data || [];

    const workbook = new ExcelJS.Workbook();

    // Feuille 1 : Vue Synthèse des Opérations
    const sheetSynth = workbook.addWorksheet("Synthèse Opérations");

    sheetSynth.columns = [
      { header: "ID", key: "id", width: 32 },
      { header: "Type", key: "type", width: 15 },
      { header: "Montant Brute", key: "amount", width: 18 },
      { header: "Com. Plat.", key: "commission", width: 15 },
      { header: "Gain Vendeur", key: "seller_earning", width: 18 },
      { header: "Statut", key: "status", width: 15 },
      { header: "Date", key: "date", width: 20 },
    ];

    orders.forEach((o) => {
      sheetSynth.addRow({
        id: o.id,
        type: "Commande",
        amount: o.total_price,
        commission: o.commission,
        seller_earning: o.seller_earning,
        status: o.status,
        date: o.created_at,
      });
    });

    withdrawals.forEach((w) => {
      sheetSynth.addRow({
        id: w.id,
        type: "Retrait",
        amount: w.amount * -1, // Montant négatif pour les retraits
        commission: 0,
        seller_earning: w.amount * -1, 
        status: w.status,
        date: w.created_at,
      });
    });

    // Feuille 2 : Utilisateurs
    const sheetUsers = workbook.addWorksheet("Utilisateurs");
    sheetUsers.columns = [
        { header: "ID", key: "id", width: 32 },
        { header: "Nom Utilisateur", key: "username", width: 20 },
        { header: "Email", key: "email", width: 30 },
        { header: "Rôle", key: "role", width: 15 },
        { header: "Date Inscription", key: "created_at", width: 20 },
    ];
    sheetUsers.addRows(users);


    // Envoi fichier Excel
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=marketplace_stats_export.xlsx");

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("Export Excel error:", err);
    return res
      .status(500)
      .json({ error: "Erreur export Excel", details: err.message });
  }
}

// ------------------------------------
// 4. Export PDF (Admin)
// ------------------------------------
export async function exportStatsPDF(req, res) {
  try {
    // ⚠️ La vérification des droits d'ADMIN est faite par le middleware requireRole

    const { data: orders } = await supabase.from("orders").select(
      "id,total_price,status,created_at"
    );

    const doc = new PDFDocument();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=marketplace_stats_export.pdf");

    doc.pipe(res);

    doc
      .fontSize(18)
      .text("Rapport Statistiques Digital Market Space", { align: "center" });
    doc.moveDown();

    doc.fontSize(14).text(`Date du rapport: ${new Date().toLocaleDateString()}`, { align: "right" });
    doc.moveDown();

    doc.fontSize(14).text("📊 Commandes :", { underline: true });

    // Affichage des commandes (pourrait être amélioré avec des tableaux PDFKit)
    orders?.forEach((o) => {
      doc
        .fontSize(10)
        .text(
          `- ID: ${o.id.substring(0, 8)}..., Montant: ${o.total_price} CFA, Statut: ${o.status}, Date: ${new Date(o.created_at).toLocaleDateString()}`
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
