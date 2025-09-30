import { supabase } from "../config/supabaseClient.js";

/**
 * Créer une demande de retrait
 */
export const createWithdrawal = async (req, res) => {
  try {
    const { amount } = req.body;
    const userId = req.user.id;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Montant invalide" });
    }

    // Vérifier le solde
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", userId)
      .single();

    if (walletError) throw walletError;

    if (!wallet || wallet.balance < amount) {
      return res.status(400).json({ error: "Solde insuffisant" });
    }

    // Créer la demande
    const { data, error } = await supabase
      .from("withdrawals")
      .insert([{ user_id: userId, amount, status: "pending" }])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ message: "Demande de retrait créée", withdrawal: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Récupérer mes demandes de retrait
 */
export const getMyWithdrawals = async (req, res) => {
  try {
    const userId = req.user.id;

    const { data, error } = await supabase
      .from("withdrawals")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Récupérer toutes les demandes (ADMIN)
 */
export const getAllWithdrawals = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Accès refusé" });
    }

    const { data, error } = await supabase
      .from("withdrawals")
      .select(`
        *,
        users ( email )
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Valider une demande de retrait (ADMIN)
 */
export const validateWithdrawal = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Accès refusé" });
    }

    const { id } = req.params;

    const { data, error } = await supabase
      .from("withdrawals")
      .update({ status: "approved" })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: "Retrait validé", withdrawal: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Rejeter une demande de retrait (ADMIN)
 */
export const rejectWithdrawal = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Accès refusé" });
    }

    const { id } = req.params;

    const { data, error } = await supabase
      .from("withdrawals")
      .update({ status: "rejected" })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: "Retrait rejeté", withdrawal: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
