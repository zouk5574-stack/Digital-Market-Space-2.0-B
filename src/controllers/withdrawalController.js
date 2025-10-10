// src/controllers/withdrawalController.js (FINALISÉ)

import { supabase } from "../server.js";
// Import du logger pour la traçabilité des actions sensibles
import { addLog } from "./logController.js"; 

// =====================================
// 1. Demander un retrait (VENDEUR/ADMIN)
// =====================================
export async function createWithdrawal(req, res) {
  const userId = req.user.db.id; // ⬅️ COHÉRENCE : Utilisation de req.user.db.id
  const { amount, provider_id, account_number } = req.body;
  const parsedAmount = parseFloat(amount);

  if (!parsedAmount || !provider_id || !account_number) {
    return res.status(400).json({ error: "Champs obligatoires (montant, fournisseur, numéro de compte) manquants" });
  }

  // Le montant demandé doit être positif
  if (parsedAmount <= 0) {
      return res.status(400).json({ error: "Le montant du retrait doit être supérieur à zéro." });
  }

  try {
    // 1. Vérifier le solde (sans bloquer)
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", userId)
      .single();

    if (walletError || !wallet) {
      return res.status(404).json({ error: "Wallet introuvable" });
    }
    if (wallet.balance < parsedAmount) {
      return res.status(400).json({ error: "Solde insuffisant pour ce retrait" });
    }

    // 2. Déduire immédiatement le montant du solde (bloquer le montant)
    const { error: decrementError } = await supabase.rpc("decrement_wallet_balance", {
        user_id_param: userId,
        amount_param: parsedAmount
    });

    if (decrementError) {
        console.error("Wallet decrement error:", decrementError);
        // Si le RPC échoue, c'est probablement dû à une race condition ou un solde négatif
        return res.status(400).json({ error: "Erreur lors du blocage du montant. Veuillez réessayer." });
    }

    // 3. Créer la demande de retrait (le statut est 'pending')
    const { data: withdrawal, error: insertError } = await supabase
      .from("withdrawals")
      .insert([{
        user_id: userId,
        amount: parsedAmount,
        provider_id,
        account_number,
        status: "pending"
      }])
      .select()
      .single();

    if (insertError) {
        // ⚠️ CRITIQUE : Si l'insertion échoue, le solde est BLOCQUÉ.
        // Un rollback manuel est nécessaire.
        const { error: refundRollbackError } = await supabase.rpc("increment_wallet_balance", {
            user_id_param: userId,
            amount_param: parsedAmount
        });
        
        console.error("Erreur critique: Échec de l'insertion du retrait après la déduction du wallet. Remboursement tenté:", refundRollbackError);
        return res.status(500).json({ error: "Erreur enregistrement demande (montant remboursé si possible)", details: insertError.message });
    }

    // 4. Logger l'action
    await addLog(userId, 'WITHDRAWAL_REQUEST', { withdrawal_id: withdrawal.id, amount: parsedAmount });

    return res.status(201).json({ message: "Retrait demandé (montant bloqué) ✅", withdrawal });
  } catch (err) {
    console.error("Request withdrawal error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
}

// =====================================
// 2. Voir mes retraits (VENDEUR/ADMIN)
// =====================================
export async function getMyWithdrawals(req, res) {
  try {
    const userId = req.user.db.id; // ⬅️ COHÉRENCE : Utilisation de req.user.db.id

    const { data, error } = await supabase
      .from("withdrawals")
      // Joindre le nom du fournisseur
      .select("*, provider:provider_id(name)") 
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return res.json({ withdrawals: data });
  } catch (err) {
    console.error("Get my withdrawals error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
}

// =====================================
// 3. Admin : voir toutes les demandes de retrait
// =====================================
export async function getAllWithdrawals(req, res) {
  try {
    // ⚠️ Confiance au middleware requireRole(["ADMIN", "SUPER_ADMIN"])

    const { data, error } = await supabase
      .from("withdrawals")
      // Joindre l'utilisateur (username) et le fournisseur
      .select("*, user:user_id(username, phone), provider:provider_id(name)")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return res.json({ withdrawals: data });
  } catch (err) {
    console.error("Get all withdrawals error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
}

// =====================================
// 4. Admin : valider un retrait (APPROVE)
// =====================================
export async function validateWithdrawal(req, res) {
    const adminId = req.user.db.id; 
    const { id } = req.params; 

    try {
        // 1. Vérifier demande existante et statut
        const { data: withdrawal, error: fetchError } = await supabase
            .from("withdrawals")
            .select("id, user_id, amount, status")
            .eq("id", id)
            .single();

        if (fetchError || !withdrawal) {
            return res.status(404).json({ error: "Retrait introuvable" });
        }
        if (withdrawal.status !== "pending") {
            return res.status(400).json({ error: "Retrait déjà traité ou non en attente" });
        }

        // 2. Mettre à jour le statut
        const { data: updated, error } = await supabase
            .from("withdrawals")
            .update({ status: "approved", processed_by_admin_id: adminId, processed_at: new Date().toISOString() })
            .eq("id", id)
            .select()
            .single();

        if (error) throw error;

        // 3. Log
        await addLog(adminId, 'WITHDRAWAL_APPROVED', { withdrawal_id: id, user_id: withdrawal.user_id, amount: withdrawal.amount });

        // Note: Le montant est bloqué, la validation signifie que l'admin a initié le transfert réel hors système.
        return res.json({ message: "Retrait approuvé (transaction en cours) ✅", withdrawal: updated });
    } catch (err) {
        console.error("Approve withdrawal error:", err);
        return res.status(500).json({ error: "Erreur serveur lors de l'approbation du retrait", details: err.message });
    }
}

// =====================================
// 5. Admin : rejeter un retrait (REJECT)
// =====================================
export async function rejectWithdrawal(req, res) {
    const adminId = req.user.db.id; 
    const { id } = req.params;
    const { reason } = req.body; 

    if (!reason || reason.length < 5) {
        return res.status(400).json({ error: "Une raison de rejet d'au moins 5 caractères est requise." });
    }

    try {
        // 1. Vérifier demande existante et statut
        const { data: withdrawal, error: fetchError } = await supabase
            .from("withdrawals")
            .select("id, user_id, amount, status")
            .eq("id", id)
            .single();

        if (fetchError || !withdrawal) {
            return res.status(404).json({ error: "Retrait introuvable" });
        }
        if (withdrawal.status !== "pending") {
            return res.status(400).json({ error: "Retrait déjà traité ou non en attente" });
        }

        // 2. Rembourser le montant bloqué au wallet de l'utilisateur (CRITIQUE)
        const { error: refundError } = await supabase.rpc("increment_wallet_balance", {
            user_id_param: withdrawal.user_id,
            amount_param: withdrawal.amount
        });

        if (refundError) {
            // Log d'une erreur critique de remboursement
            await addLog(adminId, 'CRITICAL_WITHDRAWAL_REFUND_FAILED', { withdrawal_id: id, user_id: withdrawal.user_id });
            throw new Error("Échec du remboursement du solde bloqué. Contactez le support.");
        }

        // 3. Mettre à jour le statut
        const { data: updated, error } = await supabase
            .from("withdrawals")
            .update({ 
                status: "rejected", 
                rejection_reason: reason,
                processed_by_admin_id: adminId,
                processed_at: new Date().toISOString()
            })
            .eq("id", id)
            .select()
            .single();

        if (error) throw error;

        // 4. Log
        await addLog(adminId, 'WITHDRAWAL_REJECTED', { withdrawal_id: id, user_id: withdrawal.user_id, amount: withdrawal.amount, reason });

        return res.json({ message: "Retrait rejeté (montant remboursé au wallet) ❌", withdrawal: updated });
    } catch (err) {
        console.error("Reject withdrawal error:", err);
        return res.status(500).json({ error: "Erreur serveur lors du rejet du retrait et du remboursement", details: err.message });
    }
}
