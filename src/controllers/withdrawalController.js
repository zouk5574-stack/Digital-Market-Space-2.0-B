// src/controllers/withdrawalController.js
import { supabase } from "../server.js";
import { addLog } from "./logController.js"; 

// =====================================
// 1. Demander un retrait (VENDEUR/ADMIN)
// =====================================
export async function createWithdrawal(req, res) {
  const userId = req.user.db.id;
  const { amount, provider_id, account_number } = req.body;
  const parsedAmount = parseFloat(amount);

  if (!parsedAmount || !provider_id || !account_number) {
    return res.status(400).json({ error: "Champs obligatoires manquants" });
  }

  if (parsedAmount <= 0) {
    return res.status(400).json({ error: "Le montant du retrait doit être supérieur à zéro." });
  }

  const walletTable = req.user.role === "ADMIN" ? "admin_wallets" : "wallets";

  try {
    const { data: wallet, error: walletError } = await supabase
      .from(walletTable)
      .select("balance")
      .eq("user_id", userId)
      .single();

    if (walletError || !wallet) {
      return res.status(404).json({ error: "Wallet introuvable" });
    }

    if (wallet.balance < parsedAmount) {
      return res.status(400).json({ error: "Solde insuffisant pour ce retrait" });
    }

    // RPC de déduction
    const { error: decrementError } = await supabase.rpc("decrement_wallet_balance", {
      user_id_param: userId,
      amount_param: parsedAmount
    });

    if (decrementError) {
      return res.status(400).json({ error: "Erreur lors du blocage du montant. Veuillez réessayer." });
    }

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
      await supabase.rpc("increment_wallet_balance", {
        user_id_param: userId,
        amount_param: parsedAmount
      });
      return res.status(500).json({ error: "Erreur enregistrement demande (montant remboursé)", details: insertError.message });
    }

    await addLog(userId, 'WITHDRAWAL_REQUEST', { withdrawal_id: withdrawal.id, amount: parsedAmount });
    return res.status(201).json({ message: "Retrait demandé (montant bloqué) ✅", withdrawal });

  } catch (err) {
    console.error("Request withdrawal error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
}

// =====================================
// 2. Voir mes retraits
// =====================================
export async function getMyWithdrawals(req, res) {
  try {
    const userId = req.user.db.id;
    const { data, error } = await supabase
      .from("withdrawals")
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
// 3. Admin : voir toutes les demandes
// =====================================
export async function getAllWithdrawals(req, res) {
  try {
    const { data, error } = await supabase
      .from("withdrawals")
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
// 4. Admin : valider un retrait
// =====================================
export async function validateWithdrawal(req, res) {
  const adminId = req.user.db.id;
  const { id } = req.params;

  try {
    const { data: withdrawal, error: fetchError } = await supabase
      .from("withdrawals")
      .select("id, user_id, amount, status")
      .eq("id", id)
      .single();

    if (fetchError || !withdrawal) return res.status(404).json({ error: "Retrait introuvable" });
    if (withdrawal.status !== "pending") return res.status(400).json({ error: "Retrait déjà traité" });

    const { data: updated, error } = await supabase
      .from("withdrawals")
      .update({ status: "approved", processed_by_admin_id: adminId, processed_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    await addLog(adminId, 'WITHDRAWAL_APPROVED', { withdrawal_id: id, user_id: withdrawal.user_id, amount: withdrawal.amount });
    return res.json({ message: "Retrait approuvé (transaction en cours) ✅", withdrawal: updated });
  } catch (err) {
    console.error("Approve withdrawal error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
}

// =====================================
// 5. Admin : rejeter un retrait
// =====================================
export async function rejectWithdrawal(req, res) {
  const adminId = req.user.db.id;
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason || reason.length < 5) return res.status(400).json({ error: "Raison de rejet d'au moins 5 caractères requise." });

  try {
    const { data: withdrawal, error: fetchError } = await supabase
      .from("withdrawals")
      .select("id, user_id, amount, status")
      .eq("id", id)
      .single();

    if (fetchError || !withdrawal) return res.status(404).json({ error: "Retrait introuvable" });
    if (withdrawal.status !== "pending") return res.status(400).json({ error: "Retrait déjà traité" });

    const { error: refundError } = await supabase.rpc("increment_wallet_balance", {
      user_id_param: withdrawal.user_id,
      amount_param: withdrawal.amount
    });

    if (refundError) {
      await addLog(adminId, 'CRITICAL_WITHDRAWAL_REFUND_FAILED', { withdrawal_id: id, user_id: withdrawal.user_id });
      throw new Error("Échec du remboursement du solde bloqué.");
    }

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

    await addLog(adminId, 'WITHDRAWAL_REJECTED', { withdrawal_id: id, user_id: withdrawal.user_id, amount: withdrawal.amount, reason });
    return res.json({ message: "Retrait rejeté (montant remboursé) ❌", withdrawal: updated });
  } catch (err) {
    console.error("Reject withdrawal error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
}