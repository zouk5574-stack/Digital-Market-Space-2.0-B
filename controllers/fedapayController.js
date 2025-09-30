import { supabase } from "../server.js";
import axios from "axios";

// ✅ Créer une transaction FedaPay
export async function createFedapayTransaction(req, res) {
  try {
    const userId = req.user.sub;
    const { amount, description, currency = "XOF" } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Montant invalide" });
    }

    // Récupérer les clés Fedapay
    const { data: keys, error: keyError } = await supabase
      .from("payment_providers")
      .select("public_key, secret_key")
      .eq("provider", "fedapay")
      .single();

    if (keyError || !keys) {
      return res.status(500).json({ error: "Clés Fedapay non configurées" });
    }

    // Créer la transaction via API Fedapay
    const response = await axios.post(
      "https://sandbox-api.fedapay.com/v1/transactions",
      {
        description,
        amount,
        currency,
        callback_url: `${process.env.BASE_URL}/api/fedapay/callback`,
      },
      {
        headers: {
          Authorization: `Bearer ${keys.secret_key}`,
          "Content-Type": "application/json",
        },
      }
    );

    const transaction = response.data;

    // Sauvegarder en DB
    await supabase.from("transactions").insert([
      {
        user_id: userId,
        provider: "fedapay",
        provider_id: transaction.id,
        amount,
        status: "pending",
        description,
      },
    ]);

    return res.json({
      message: "Transaction créée ✅",
      transaction_url: transaction.checkout_url,
    });
  } catch (err) {
    console.error("Create Fedapay transaction error:", err.response?.data || err.message);
    return res.status(500).json({
      error: "Erreur serveur",
      details: err.response?.data || err.message,
    });
  }
}

// ✅ Callback Webhook Fedapay
export async function fedapayCallback(req, res) {
  try {
    const { id, status } = req.body.data || {};

    if (!id || !status) {
      return res.status(400).json({ error: "Callback invalide" });
    }

    // Mettre à jour transaction
    const { data: transaction, error } = await supabase
      .from("transactions")
      .update({ status })
      .eq("provider_id", id)
      .select()
      .single();

    if (error || !transaction) {
      return res.status(404).json({ error: "Transaction introuvable" });
    }

    // Si paiement réussi → créditer le wallet
    if (status === "approved") {
      await supabase.rpc("increment_wallet_balance", {
        user_id: transaction.user_id,
        amount: transaction.amount,
      });
    }

    return res.json({ message: "Callback traité ✅" });
  } catch (err) {
    console.error("Fedapay callback error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
      }
