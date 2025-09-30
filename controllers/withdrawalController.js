// controllers/withdrawalController.js
import { supabase } from "../server.js";

// ✅ Demander un retrait (vendeur)
export async function requestWithdrawal(req, res) {
  try {
    const userId = req.user.sub;
    const { amount, provider_id, account_number } = req.body;

    if (!amount || !provider_id || !account_number) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }

    // Vérifier solde wallet
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", userId)
      .single();

    if (walletError || !wallet) {
      return res.status(404).json({ error: "Wallet introuvable" });
    }
    if (wallet.balance < amount) {
      return res.status(400).json({ error: "Solde insuffisant" });
    }

    // Créer la demande de retrait
    const { data: withdrawal, error } = await supabase
      .from("withdrawals")
      .insert([{
        user_id: userId,
        amount,
        provider_id,
        account_number,
        status: "pending"
      }])
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({ message: "Retrait demandé ✅", withdrawal });
  } catch (err) {
    console.error("Request withdrawal error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
}

// ✅ Voir mes retraits (vendeur)
export async function getMyWithdrawals(req, res) {
  try {
    const userId = req.user.sub;
    const { data, error } = await supabase
      .from("withdrawals")
      .select("*, payment_providers(name)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return res.json({ withdrawals: data });
  } catch (err) {
    console.error("Get my withdrawals error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
}

// ✅ Admin : voir toutes les demandes de retrait
export async function getAllWithdrawals(req, res) {
  try {
    if (!req.user.is_super_admin) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    const { data, error } = await supabase
      .from("withdrawals")
      .select("*, users(username, phone), payment_providers(name)")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return res.json({ withdrawals: data });
  } catch (err) {
    console.error("Get all withdrawals error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
}

// ✅ Admin : valider ou rejeter un retrait
export async function updateWithdrawalStatus(req, res) {
  try {
    if (!req.user.is_super_admin) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    const { id } = req.params;
    const { status } = req.body; // "approved" ou "rejected"

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Statut invalide" });
    }

    // Vérifier demande existante
    const { data: withdrawal, error: fetchError } = await supabase
      .from("withdrawals")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !withdrawal) {
      return res.status(404).json({ error: "Retrait introuvable" });
    }
    if (withdrawal.status !== "pending") {
      return res.status(400).json({ error: "Déjà traité" });
    }

    // Si approuvé, déduire du wallet
    if (status === "approved") {
      const { error: updateWalletError } = await supabase.rpc("decrement_wallet_balance", {
        user_id: withdrawal.user_id,
        amount: withdrawal.amount
      });

      if (updateWalletError) throw updateWalletError;
    }

    // Mettre à jour le statut
    const { data: updated, error } = await supabase
      .from("withdrawals")
      .update({ status })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return res.json({ message: `Retrait ${status} ✅`, withdrawal: updated });
  } catch (err) {
    console.error("Update withdrawal status error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
}
