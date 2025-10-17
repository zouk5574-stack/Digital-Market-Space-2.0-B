// src/controllers/walletController.js (VERSION CORRIGÉE)

import { supabase } from "../server.js";
import { addLog } from "./logController.js"; 

// ========================
// ✅ 1. Récupérer le solde du wallet d'un utilisateur
// ========================
export async function getWallet(req, res) {
  try {
    // ➡️ CORRECTION : Utilisation de req.user.id (plus cohérent avec votre structure)
    const userId = req.user.id; 

    const { data: wallet, error } = await supabase
      .from("wallets")
      .select("id, balance, user_id")
      .eq("user_id", userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    
    // Si le wallet n'existe pas, on le crée automatiquement
    if (!wallet) {
      const { data: newWallet, error: createError } = await supabase
        .from("wallets")
        .insert([{ user_id: userId, balance: 0 }])
        .select()
        .single();
        
      if (createError) throw createError;
      return res.json({ wallet: newWallet });
    }

    return res.json({ wallet });
  } catch (err) {
    console.error("Get wallet error:", err);
    return res.status(500).json({ error: "Erreur serveur interne", details: err.message });
  }
}

// ========================
// ✅ 2. Demande de retrait (VERSION AMÉLIORÉE)
// ========================
export async function requestWithdrawal(req, res) {
  try {
    const userId = req.user.id; // ➡️ CORRIGÉ
    const { amount } = req.body;

    const parsedAmount = parseFloat(amount);

    if (!parsedAmount || parsedAmount <= 0) {
      return res.status(400).json({ error: "Montant invalide ou manquant." });
    }

    // 1. Vérifier le solde du wallet
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", userId)
      .single();

    if (walletError || !wallet) {
      return res.status(404).json({ error: "Wallet introuvable." });
    }

    if (wallet.balance < parsedAmount) {
      return res.status(400).json({ error: "Solde insuffisant." });
    }

    // 2. Débiter le wallet (méthode alternative si RPC non disponible)
    const { error: debitError } = await supabase
      .from('wallets')
      .update({ balance: supabase.raw(`balance - ${parsedAmount}`) })
      .eq('user_id', userId)
      .gte('balance', parsedAmount); // Condition de sécurité

    if (debitError) {
      return res.status(400).json({ error: "Solde insuffisant après vérification." });
    }

    // 3. Créer la demande de retrait
    const { data: withdrawal, error: withdrawalError } = await supabase
      .from("withdrawals")
      .insert([{ 
        user_id: userId, 
        amount: parsedAmount, 
        status: "pending" // Selon votre ENUM: pending, approved, rejected, processed
      }])
      .select()
      .single();

    if (withdrawalError) {
      // ⚠️ Compensation: recréditer le wallet en cas d'erreur
      await supabase
        .from('wallets')
        .update({ balance: supabase.raw(`balance + ${parsedAmount}`) })
        .eq('user_id', userId);
      
      console.error("Withdrawal insert failed, wallet credited back:", withdrawalError);
      return res.status(500).json({ error: "Erreur lors de la création de la demande de retrait." });
    }

    // 4. Log de l'action
    await addLog(userId, 'WITHDRAWAL_REQUESTED', { 
      withdrawal_id: withdrawal.id, 
      amount: parsedAmount 
    });

    return res.status(201).json({
      message: "Demande de retrait envoyée et solde débité ✅",
      withdrawal
    });
  } catch (err) {
    console.error("Withdrawal request error:", err);
    return res.status(500).json({ error: "Erreur serveur interne", details: err.message });
  }
}

// ========================
// ✅ 3. Liste des retraits d'un utilisateur
// ========================
export async function getWithdrawals(req, res) {
  try {
    const userId = req.user.id; // ➡️ CORRIGÉ

    const { data: withdrawals, error } = await supabase
      .from("withdrawals")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return res.json({ withdrawals });
  } catch (err) {
    console.error("Get withdrawals error:", err);
    return res.status(500).json({ error: "Erreur serveur interne", details: err.message });
  }
}

// ========================
// ✅ 4. Historique des transactions du wallet (NOUVEAU)
// ========================
export async function getWalletTransactions(req, res) {
  try {
    const userId = req.user.id;

    const { data: transactions, error } = await supabase
      .from("wallet_transactions")
      .select("id, amount, description, type, status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    return res.json({ transactions: transactions || [] });
  } catch (err) {
    console.error("Get wallet transactions error:", err);
    return res.status(500).json({ error: "Erreur serveur interne", details: err.message });
  }
}
