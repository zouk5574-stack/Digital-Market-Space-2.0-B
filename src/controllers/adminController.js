// src/controllers/adminController.js

import { supabase } from "../server.js";
// ➡️ IMPORT CRITIQUE : Pour la traçabilité des actions sensibles de l'Admin
import { addLog } from "./logController.js"; 

// ========================
// 🧑‍💻 1. Lister tous les utilisateurs
// ========================
export async function listUsers(req, res) {
  try {
    const { data: users, error } = await supabase
      .from("users")
      .select("id, username, email, role, is_active, created_at, wallet_balance:wallets(balance)") // ⬅️ Utile pour l'Admin
      .order("created_at", { ascending: false });

    if (error) throw error;
    
    return res.json({ success: true, users });
  } catch (err) {
    console.error("Admin list users error:", err);
    return res.status(500).json({ error: "Erreur serveur lors de la récupération des utilisateurs.", details: err.message });
  }
}

// ========================
// 🛑 2. Bloquer/Débloquer un utilisateur
// ========================
export async function toggleUserStatus(req, res) {
  const adminId = req.user.db.id;
  const { userId } = req.params;
  const { is_active } = req.body;

  try {
    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ error: "Statut 'is_active' manquant ou invalide." });
    }

    if (userId === adminId) {
        return res.status(403).json({ error: "Opération non autorisée. Vous ne pouvez pas modifier votre propre statut." });
    }
    
    const { data: updatedUser, error } = await supabase
      .from("users")
      .update({ is_active })
      .eq("id", userId)
      .select('id, username, is_active')
      .single();

    if (error) throw error;
    
    // ➡️ Log l'action critique
    const actionType = is_active ? "USER_UNBLOCKED" : "USER_BLOCKED";
    await addLog(adminId, actionType, { target_user_id: userId, new_status: is_active });

    const statusMessage = updatedUser.is_active ? "débloqué" : "bloqué";
    return res.json({ message: `Utilisateur ${updatedUser.username} ${statusMessage} ✅`, user: updatedUser });
  } catch (err) {
    console.error("Admin toggle user status error:", err);
    return res.status(500).json({ error: "Erreur serveur lors de la mise à jour du statut.", details: err.message });
  }
}

// ========================
// 📜 3. Lister les demandes de retrait EN ATTENTE
// ➡️ COHÉRENCE : Renommé de 'listPayouts' à 'listWithdrawals'
// ========================
export async function listWithdrawals(req, res) {
  try {
    const { data: withdrawals, error } = await supabase
      .from("withdrawals") // ⬅️ Table utilisée précédemment
      // On liste toutes les demandes, ou seulement les 'pending' (pending est plus pertinent pour l'Admin)
      .select("*, user:user_id(username, email), provider:provider_id(name)") 
      .eq("status", "pending")
      .order("created_at", { ascending: true }); // Ordre par date de demande

    if (error) throw error;
    
    return res.json({ success: true, pending_withdrawals: withdrawals });
  } catch (err) {
    console.error("Admin list withdrawals error:", err);
    return res.status(500).json({ error: "Erreur serveur lors de la récupération des retraits.", details: err.message });
  }
}

// ========================
// ✅ 4. Approuver un Retrait (VALIDATE)
// ➡️ COHÉRENCE : Renommé de 'processPayout' à 'validateWithdrawal'
// ========================
export async function validateWithdrawal(req, res) {
  const adminId = req.user.db.id;
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
    
    // 2. Mettre à jour le statut du withdrawal à 'approved'
    const { data: updatedWithdrawal, error } = await supabase
      .from("withdrawals")
      .update({ 
          status: 'approved', 
          processed_by_admin_id: adminId,
          processed_at: new Date().toISOString()
      })
      .eq("id", withdrawalId)
      .select()
      .single();

    if (error) throw error;
    
    // ➡️ Log l'action critique
    await addLog(adminId, 'WITHDRAWAL_APPROVED', { withdrawal_id: updatedWithdrawal.id, user_id: updatedWithdrawal.user_id, amount: updatedWithdrawal.amount });

    const message = "Retrait approuvé ✅ (L'Admin est responsable d'effectuer le transfert externe)";
    return res.json({ message, withdrawal: updatedWithdrawal });
    
  } catch (err) {
    console.error("Admin validate withdrawal error:", err);
    return res.status(500).json({ error: "Erreur serveur lors de l'approbation du retrait.", details: err.message });
  }
}

// ========================
// ❌ 5. Rejeter un Retrait (REJECT)
// ➡️ CRÉATION : Extraction et renommage de la logique de rejet
// ========================
export async function rejectWithdrawal(req, res) {
    const adminId = req.user.db.id;
    const { withdrawalId } = req.params;
    const { rejection_reason } = req.body; // Raison du rejet

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
        
        // 2. Rembourser les fonds bloqués au portefeuille (via RPC)
        const { error: refundError } = await supabase.rpc("increment_wallet_balance", {
            user_id_param: withdrawal.user_id, // Utilisation de _param si votre fonction RPC l'exige
            amount_param: withdrawal.amount 
        });

        if (refundError) throw refundError;
        
        // 3. Mettre à jour le statut à 'rejected'
        const { data: updatedWithdrawal, error } = await supabase
          .from("withdrawals")
          .update({ 
              status: 'rejected', 
              processed_by_admin_id: adminId,
              rejection_reason: rejection_reason || "Non spécifié par l'administrateur",
              processed_at: new Date().toISOString()
          })
          .eq("id", withdrawalId)
          .select()
          .single();

        if (error) throw error;
        
        // ➡️ Log l'action critique
        await addLog(adminId, 'WITHDRAWAL_REJECTED', { withdrawal_id: updatedWithdrawal.id, user_id: updatedWithdrawal.user_id, amount: updatedWithdrawal.amount, reason: rejection_reason });

        const message = "Retrait rejeté et fonds remboursés au portefeuille 🔄";
        return res.json({ message, withdrawal: updatedWithdrawal });
        
    } catch (err) {
        console.error("Admin reject withdrawal error:", err);
        return res.status(500).json({ error: "Erreur serveur lors du rejet du retrait et du remboursement.", details: err.message });
    }
                }
                                                      
