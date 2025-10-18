// src/controllers/adminController.js

import { supabase } from "../server.js";
import { addLog } from "./logController.js";

// ========================
// 🧑‍💻 1. Lister tous les utilisateurs (MIS À JOUR)
// ========================
export async function listUsers(req, res) {
  try {
    const { data: users, error } = await supabase
      .from("users")
      .select(`
        id, 
        username, 
        email, 
        firstname,
        lastname,
        phone,
        role_id,
        roles(name, description),
        is_super_admin,
        is_commission_exempt,
        email_confirmed,
        is_active,
        created_at,
        wallets(balance)
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Formater les données
    const formattedUsers = users.map(user => ({
      id: user.id,
      username: user.username,
      email: user.email,
      firstname: user.firstname,
      lastname: user.lastname,
      phone: user.phone,
      role: user.roles?.name || 'N/A',
      role_description: user.roles?.description || '',
      is_super_admin: user.is_super_admin,
      is_commission_exempt: user.is_commission_exempt,
      email_confirmed: user.email_confirmed,
      is_active: user.is_active, // ✅ Utilise le vrai champ maintenant
      created_at: user.created_at,
      wallet_balance: user.wallets?.[0]?.balance || 0
    }));

    return res.json({ success: true, users: formattedUsers });
  } catch (err) {
    console.error("Admin list users error:", err);
    return res.status(500).json({ error: "Erreur serveur lors de la récupération des utilisateurs.", details: err.message });
  }
}

// ========================
// 🛑 2. Bloquer/Débloquer un utilisateur (MIS À JOUR)
// ========================
export async function toggleUserStatus(req, res) {
  const adminId = req.user.id;
  const { userId } = req.params;
  const { is_active } = req.body;

  try {
    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ error: "Statut 'is_active' manquant ou invalide." });
    }

    if (userId === adminId) {
      return res.status(403).json({ error: "Opération non autorisée. Vous ne pouvez pas modifier votre propre statut." });
    }

    // ✅ Utilise le vrai champ is_active maintenant
    const { data: updatedUser, error } = await supabase
      .from("users")
      .update({ 
        is_active: is_active 
      })
      .eq("id", userId)
      .select(`
        id, 
        username, 
        email,
        is_active
      `)
      .single();

    if (error) throw error;

    // Log l'action
    const actionType = is_active ? "USER_UNBLOCKED" : "USER_BLOCKED";
    await addLog(adminId, actionType, { 
      target_user_id: userId, 
      new_status: is_active 
    });

    const statusMessage = is_active ? "débloqué" : "bloqué";
    return res.json({ 
      message: `Utilisateur ${updatedUser.username} ${statusMessage} ✅`, 
      user: updatedUser
    });
  } catch (err) {
    console.error("Admin toggle user status error:", err);
    return res.status(500).json({ error: "Erreur serveur lors de la mise à jour du statut.", details: err.message });
  }
}

// ========================
// 📜 3. Lister les demandes de retrait (MIS À JOUR)
// ========================
export async function listWithdrawals(req, res) {
  try {
    const { data: withdrawals, error } = await supabase
      .from("withdrawals")
      .select(`
        *,
        users!withdrawals_user_id_fkey(
          id,
          username, 
          email,
          firstname,
          lastname
        )
      `)
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (error) throw error;

    return res.json({ success: true, pending_withdrawals: withdrawals });
  } catch (err) {
    console.error("Admin list withdrawals error:", err);
    return res.status(500).json({ error: "Erreur serveur lors de la récupération des retraits.", details: err.message });
  }
}

// ========================
// ✅ 4. Approuver un Retrait (MIS À JOUR)
// ========================
export async function validateWithdrawal(req, res) {
  const adminId = req.user.id;
  const { withdrawalId } = req.params;

  try {
    // 1. Récupérer la demande
    const { data: withdrawal, error: fetchError } = await supabase
      .from('withdrawals')
      .select('id, user_id, amount, status')
      .eq('id', withdrawalId)
      .single();

    if (fetchError || !withdrawal) {
      return res.status(404).json({ error: "Demande de retrait introuvable." });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ error: `La demande est déjà ${withdrawal.status}.` });
    }

    // 2. Mettre à jour le statut avec la valeur correcte 'approved'
    const { data: updatedWithdrawal, error } = await supabase
      .from("withdrawals")
      .update({ 
        status: 'approved', // ✅ Bonne valeur selon votre ENUM
        processed_at: new Date().toISOString()
      })
      .eq("id", withdrawalId)
      .select(`
        *,
        users!withdrawals_user_id_fkey(username, email)
      `)
      .single();

    if (error) throw error;

    // Log l'action
    await addLog(adminId, 'WITHDRAWAL_APPROVED', { 
      withdrawal_id: updatedWithdrawal.id, 
      user_id: updatedWithdrawal.user_id, 
      amount: updatedWithdrawal.amount 
    });

    const message = "Retrait approuvé ✅ (L'Admin est responsable d'effectuer le transfert externe)";
    return res.json({ message, withdrawal: updatedWithdrawal });

  } catch (err) {
    console.error("Admin validate withdrawal error:", err);
    return res.status(500).json({ error: "Erreur serveur lors de l'approbation du retrait.", details: err.message });
  }
}

// ========================
// ❌ 5. Rejeter un Retrait (MIS À JOUR)
// ========================
export async function rejectWithdrawal(req, res) {
  const adminId = req.user.id;
  const { withdrawalId } = req.params;
  const { rejection_reason } = req.body;

  try {
    // 1. Récupérer la demande
    const { data: withdrawal, error: fetchError } = await supabase
      .from('withdrawals')
      .select('id, user_id, amount, status')
      .eq('id', withdrawalId)
      .single();

    if (fetchError || !withdrawal) {
      return res.status(404).json({ error: "Demande de retrait introuvable." });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({ error: `La demande est déjà ${withdrawal.status}.` });
    }

    // 2. Rembourser les fonds via mise à jour directe du wallet
    const { error: refundError } = await supabase
      .from('wallets')
      .update({ 
        balance: supabase.raw(`balance + ${withdrawal.amount}`)
      })
      .eq('user_id', withdrawal.user_id);

    if (refundError) {
      console.error("Refund error:", refundError);
      throw refundError;
    }

    // 3. Mettre à jour le statut du withdrawal avec la valeur correcte 'rejected'
    const { data: updatedWithdrawal, error } = await supabase
      .from("withdrawals")
      .update({ 
        status: 'rejected', // ✅ Bonne valeur selon votre ENUM
        rejection_reason: rejection_reason || "Non spécifié par l'administrateur",
        processed_at: new Date().toISOString()
      })
      .eq("id", withdrawalId)
      .select(`
        *,
        users!withdrawals_user_id_fkey(username, email)
      `)
      .single();

    if (error) throw error;

    // Log l'action
    await addLog(adminId, 'WITHDRAWAL_REJECTED', { 
      withdrawal_id: updatedWithdrawal.id, 
      user_id: updatedWithdrawal.user_id, 
      amount: updatedWithdrawal.amount, 
      reason: rejection_reason 
    });

    const message = "Retrait rejeté et fonds remboursés au portefeuille 🔄";
    return res.json({ message, withdrawal: updatedWithdrawal });

  } catch (err) {
    console.error("Admin reject withdrawal error:", err);
    return res.status(500).json({ error: "Erreur serveur lors du rejet du retrait.", details: err.message });
  }
}

// ========================
// 📊 6. Statistiques Admin (MIS À JOUR)
// ========================
export async function getDashboardStats(req, res) {
  try {
    // Compter les utilisateurs
    const { count: usersCount, error: usersError } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    // Compter les produits
    const { count: productsCount, error: productsError } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true });

    // Compter les missions
    const { count: missionsCount, error: missionsError } = await supabase
      .from('freelance_missions')
      .select('*', { count: 'exact', head: true });

    // Récupérer le total des transactions
    const { data: transactions, error: transactionsError } = await supabase
      .from('transactions')
      .select('amount')
      .eq('status', 'approved');

    // Compter les retraits en attente
    const { count: pendingWithdrawalsCount, error: withdrawalsError } = await supabase
      .from('withdrawals')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (usersError || productsError || missionsError || transactionsError || withdrawalsError) {
      throw new Error('Erreur lors de la récupération des statistiques');
    }

    const totalRevenue = transactions?.reduce((sum, transaction) => sum + parseFloat(transaction.amount), 0) || 0;

    const stats = {
      total_users: usersCount || 0,
      total_products: productsCount || 0,
      total_missions: missionsCount || 0,
      total_revenue: totalRevenue,
      pending_withdrawals: pendingWithdrawalsCount || 0
    };

    return res.json({ success: true, stats });
  } catch (err) {
    console.error("Admin dashboard stats error:", err);
    return res.status(500).json({ error: "Erreur serveur lors de la récupération des statistiques.", details: err.message });
  }
}

// ========================
// 🔧 7. Mettre à jour les paramètres de commission (NOUVELLE FONCTIONNALITÉ)
// ========================
export async function updateCommissionSettings(req, res) {
  const adminId = req.user.id;
  const { default_commission_rate, exempted_roles } = req.body;

  try {
    // Mettre à jour les paramètres dans la table settings
    const { error } = await supabase
      .from('settings')
      .upsert({
        key: 'commission_settings',
        value: {
          default_commission_rate: default_commission_rate || 0.1,
          exempted_roles: exempted_roles || [],
          updated_by: adminId,
          updated_at: new Date().toISOString()
        },
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'key'
      });

    if (error) throw error;

    // Log l'action
    await addLog(adminId, 'COMMISSION_SETTINGS_UPDATED', {
      default_commission_rate,
      exempted_roles
    });

    return res.json({ 
      success: true, 
      message: "Paramètres de commission mis à jour ✅",
      settings: {
        default_commission_rate,
        exempted_roles
      }
    });
  } catch (err) {
    console.error("Admin update commission settings error:", err);
    return res.status(500).json({ error: "Erreur serveur lors de la mise à jour des paramètres.", details: err.message });
  }
}
