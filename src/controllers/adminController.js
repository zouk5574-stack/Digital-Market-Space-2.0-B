// src/controllers/adminController.js (Simplifié pour un seul Admin)

import { supabase } from "../server.js";

// ========================
// 🧑‍💻 1. Lister tous les utilisateurs
// ========================
export async function listUsers(req, res) {
  try {
    // La vérification de rôle a été faite par le middleware (requireRole(["ADMIN", "SUPER_ADMIN"])).
    const { data: users, error } = await supabase
      .from("users")
      .select("id, username, email, role, is_active, created_at") 
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
  try {
    const { userId } = req.params;
    const { is_active } = req.body; // true ou false
    const adminId = req.user.db.id; // L'ID de l'Admin qui fait la requête

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ error: "Statut 'is_active' manquant ou invalide." });
    }

    // Sécurité critique : Empêcher l'Admin de se bloquer lui-même (sauf si c'est nécessaire pour le scénario)
    if (userId === adminId) {
        return res.status(403).json({ error: "Opération non autorisée. Vous ne pouvez pas modifier votre propre statut." });
    }
    
    // Simplification : Pas besoin de vérifier 'SUPER_ADMIN' vs 'ADMIN' puisque l'utilisateur qui a accès ici est l'unique Admin.

    const { data: updatedUser, error } = await supabase
      .from("users")
      .update({ is_active })
      .eq("id", userId)
      .select('id, username, is_active')
      .single();

    if (error) throw error;
    
    const statusMessage = updatedUser.is_active ? "débloqué" : "bloqué";
    return res.json({ message: `Utilisateur ${updatedUser.username} ${statusMessage} ✅`, user: updatedUser });
  } catch (err) {
    console.error("Admin toggle user status error:", err);
    return res.status(500).json({ error: "Erreur serveur lors de la mise à jour du statut.", details: err.message });
  }
}

// ========================
// 📜 3. Lister les demandes de retrait (Payouts)
// ========================
export async function listPayouts(req, res) {
  try {
    const { data: payouts, error } = await supabase
      .from("payouts")
      // Nous listons toutes les demandes en attente, car l'Admin unique est le seul à les voir
      .select("*, user:user_id(username, email)") 
      .eq("status", "pending")
      .order("requested_at", { ascending: true });

    if (error) throw error;
    
    return res.json({ success: true, pending_payouts: payouts });
  } catch (err) {
    console.error("Admin list payouts error:", err);
    return res.status(500).json({ error: "Erreur serveur lors de la récupération des retraits.", details: err.message });
  }
}

// ========================
// ✅ 4. Approuver ou Rejeter un Retrait
// ========================
export async function processPayout(req, res) {
  try {
    const { payoutId } = req.params;
    const { action, admin_note } = req.body; // action: 'approve' ou 'reject'

    if (action !== 'approve' && action !== 'reject') {
      return res.status(400).json({ error: "Action invalide. Utilisez 'approve' ou 'reject'." });
    }
    
    // 1. Récupérer la demande et son statut actuel
    const { data: payout, error: fetchError } = await supabase
        .from('payouts')
        .select('id, user_id, amount, status')
        .eq('id', payoutId)
        .single();
        
    if (fetchError || !payout) {
        return res.status(404).json({ error: "Demande de retrait introuvable." });
    }
    
    if (payout.status !== 'pending') {
        return res.status(400).json({ error: `La demande est déjà ${payout.status}.` });
    }

    let newStatus = action === 'approve' ? 'completed' : 'rejected';
    
    // 2. Traitement selon l'action
    if (action === 'reject') {
        // En cas de rejet, les fonds sont REMIS dans le portefeuille (via RPC)
        const { error: refundError } = await supabase.rpc("increment_wallet_balance", {
            user_id: payout.user_id,
            amount: payout.amount 
        });
        
        if (refundError) throw refundError;
        
        // Enregistrer la transaction de remboursement
        await supabase.from("transactions").insert({
            user_id: payout.user_id,
            amount: payout.amount,
            description: `Remboursement suite à rejet du retrait #${payoutId}`,
            status: 'rejected',
            provider: 'internal_wallet'
        });
    }

    // 3. Mettre à jour le statut du payout
    const { data: updatedPayout, error } = await supabase
      .from("payouts")
      .update({ 
          status: newStatus, 
          processed_by: req.user.db.id,
          admin_note: admin_note || null,
          processed_at: new Date().toISOString()
      })
      .eq("id", payoutId)
      .single();

    if (error) throw error;
    
    const message = action === 'approve' 
        ? "Retrait approuvé ✅ (L'Admin est responsable d'effectuer le transfert externe)" 
        : "Retrait rejeté et fonds remboursés au portefeuille 🔄";
        
    return res.json({ message, payout: updatedPayout });
    
  } catch (err) {
    console.error("Admin process payout error:", err);
    return res.status(500).json({ error: "Erreur serveur lors du traitement du retrait.", details: err.message });
  }
}
  
