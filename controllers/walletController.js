import { supabase } from "../server.js";

// ✅ Récupérer le solde du wallet d'un utilisateur
export async function getWallet(req, res) {
  try {
    const userId = req.user.sub;

    const { data: wallet, error } = await supabase
      .from("wallets")
      .select("id, balance, currency")
      .eq("user_id", userId)
      .single();

    if (error) throw error;

    return res.json({ wallet });
  } catch (err) {
    console.error("Get wallet error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message || err });
  }
}

// ✅ Demande de retrait
export async function requestWithdrawal(req, res) {
  try {
    const userId = req.user.sub;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Montant invalide" });
    }

    // Récupérer le wallet
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("id, balance")
      .eq("user_id", userId)
      .single();

    if (walletError) throw walletError;
    if (!wallet) return res.status(404).json({ error: "Wallet introuvable" });

    if (wallet.balance < amount) {
      return res.status(400).json({ error: "Solde insuffisant" });
    }

    // Insérer une demande de retrait (pending)
    const { data: withdrawal, error } = await supabase
      .from("withdrawals")
      .insert([{ user_id: userId, amount, status: "pending" }])
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({
      message: "Demande de retrait envoyée ✅",
      withdrawal
    });
  } catch (err) {
    console.error("Withdrawal request error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message || err });
  }
}

// ✅ Liste des retraits d'un utilisateur
export async function getWithdrawals(req, res) {
  try {
    const userId = req.user.sub;

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
