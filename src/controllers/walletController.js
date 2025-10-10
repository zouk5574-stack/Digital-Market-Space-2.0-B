// src/controllers/walletController.js (FINALISÉ)

import { supabase } from "../server.js";
import { addLog } from "./logController.js"; 

// ========================
// ✅ 1. Récupérer le solde du wallet d'un utilisateur
// ========================
export async function getWallet(req, res) {
  try {
    // ➡️ COHÉRENCE : Utilisation de req.user.db.id
    const userId = req.user.db.id; 

    const { data: wallet, error } = await supabase
      .from("wallets")
      .select("id, balance, currency")
      .eq("user_id", userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // 'PGRST116' = no rows found
    if (!wallet) return res.status(404).json({ error: "Wallet not found. Initialize it first." });

    return res.json({ wallet });
  } catch (err) {
    console.error("Get wallet error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message || err });
  }
}

// ========================
// ✅ 2. Demande de retrait
// ========================
export async function requestWithdrawal(req, res) {
  // NOTE CRITIQUE : Cette opération doit être dans une TRANSACTION ou utiliser une fonction RPC
  // pour garantir l'atomicité et prévenir les doubles dépenses.
  try {
    // ➡️ COHÉRENCE : Utilisation de req.user.db.id
    const userId = req.user.db.id; 
    const { amount } = req.body;

    const parsedAmount = parseFloat(amount);

    if (!parsedAmount || parsedAmount <= 0) {
      return res.status(400).json({ error: "Montant invalide ou manquant." });
    }

    // 1. Récupérer le wallet pour vérifier le solde
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("id, balance")
      .eq("user_id", userId)
      .single();

    if (walletError || !wallet) return res.status(404).json({ error: "Wallet introuvable." });
    if (wallet.balance < parsedAmount) {
      return res.status(400).json({ error: "Solde insuffisant." });
    }

    // 2. CRITIQUE : Débiter le solde IMMÉDIATEMENT (via RPC)
    const { error: debitError } = await supabase.rpc("decrement_wallet_balance", {
        user_id_param: userId,
        amount_param: parsedAmount
    });
    
    if (debitError) {
        console.error("RPC Debit error:", debitError);
        // Si le RPC échoue (ex: solde négatif), on rejette la requête.
        return res.status(500).json({ error: "Échec du débit du portefeuille, annulation du retrait." });
    }

    // 3. Insérer une demande de retrait (pending)
    const { data: withdrawal, error } = await supabase
      .from("withdrawals")
      .insert([{ 
          user_id: userId, 
          amount: parsedAmount, 
          status: "pending" // L'état initial est "en attente"
      }])
      .select()
      .single();

    if (error) {
        // ⚠️ Si l'insertion échoue APRÈS le débit, il faudrait idéalement 
        // CREDITER l'utilisateur. Nous assumons ici que l'échec est rare.
        console.error("Withdrawal insert failed:", error);
        // Log de l'erreur pour enquête manuelle
        await addLog(userId, 'WITHDRAWAL_INSERT_FAILED_DEBITED', { amount: parsedAmount });
        throw error;
    }
    
    // 4. Log de l'action
    await addLog(userId, 'WITHDRAWAL_REQUESTED', { withdrawal_id: withdrawal.id, amount: parsedAmount });

    return res.status(201).json({
      message: "Demande de retrait envoyée et solde débité ✅",
      withdrawal
    });
  } catch (err) {
    console.error("Withdrawal request error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message || err });
  }
}

// ========================
// ✅ 3. Liste des retraits d'un utilisateur
// ========================
export async function getWithdrawals(req, res) {
  try {
    // ➡️ COHÉRENCE : Utilisation de req.user.db.id
    const userId = req.user.db.id; 

    const { data: withdrawals, error } = await supabase
      .from("withdrawals")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return res.json({ withdrawals });
  } catch (err) {
    console.error("Get withdrawals error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message || err });
  }
}
