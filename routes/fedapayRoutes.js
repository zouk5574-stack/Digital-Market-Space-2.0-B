import express from "express";
import { supabase } from "../server.js";
import crypto from "crypto";
import cryptoJs from "crypto-js";
import axios from "axios";

const router = express.Router();

// 🔑 Clés API depuis .env
const FEDAPAY_PUBLIC_KEY = process.env.FEDAPAY_PUBLIC_KEY;
const FEDAPAY_SECRET_KEY = process.env.FEDAPAY_SECRET_KEY;

// ⏳ Retry configuration
const MAX_RETRY = 3;
const RETRY_DELAY_MS = 2000;

// Delay utilitaire
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Retry utilitaire pour mise à jour transaction
async function updateTransactionWithRetry(transactionId, statut) {
  let attempt = 0;
  while (attempt < MAX_RETRY) {
    attempt++;
    const { error } = await supabase
      .from("transactions")
      .update({ statut, updated_at: new Date().toISOString() })
      .eq("identifiant_fournisseur", transactionId);

    if (!error) return true;
    console.error(`⚠️ Tentative ${attempt}/${MAX_RETRY} échouée :`, error.message);
    if (attempt < MAX_RETRY) await delay(RETRY_DELAY_MS);
  }
  return false;
}

/**
 * 👉 Créer une transaction Fedapay (réelle)
 * role: "buyer" | "seller" | "admin"
 */
router.post("/init", async (req, res) => {
  try {
    const { userId, montant, devise, description, role } = req.body;

    if (!userId || !montant || !devise || !role)
      return res.status(400).json({ error: "Données manquantes" });

    if (typeof montant !== "number" || montant <= 0)
      return res.status(400).json({ error: "Montant invalide" });

    if (!FEDAPAY_PUBLIC_KEY || !FEDAPAY_SECRET_KEY)
      return res.status(500).json({ error: "Clés Fedapay non configurées" });

    // Créer la transaction côté Fedapay
    const payload = {
      amount: montant,
      currency: devise,
      description,
      metadata: {
        userId,
        role, // buyer, seller, admin
      },
      callback_url: `${process.env.BASE_URL}/api/fedapay/webhook`,
    };

    const fedapayResponse = await axios.post(
      "https://api.fedapay.com/transactions",
      payload,
      {
        headers: {
          "Authorization": `Bearer ${FEDAPAY_PUBLIC_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const fedapayTransactionId = fedapayResponse.data.id;

    // Enregistrement transaction dans Supabase
    const { error: insertError } = await supabase.from("transactions").insert([
      {
        id: crypto.randomUUID(),
        user_id: userId,
        role,
        fournisseur: "fedapay",
        identifiant_fournisseur: fedapayTransactionId,
        montant,
        devise,
        description,
        statut: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    if (insertError) {
      console.error("Erreur insertion transaction:", insertError);
      return res.status(500).json({ error: "Erreur enregistrement transaction" });
    }

    return res.json({
      message: "Paiement initié avec succès",
      transactionId: fedapayTransactionId,
      redirectUrl: fedapayResponse.data.checkout_url,
    });
  } catch (err) {
    console.error("Erreur init paiement Fedapay :", err.response?.data || err.message);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/**
 * 👉 Webhook Fedapay sécurisé (tous rôles)
 */
router.post("/webhook", async (req, res) => {
  try {
    const { transactionId, statut } = req.body;
    const signature = req.headers["x-fedapay-signature"];

    if (!transactionId || !statut || !signature)
      return res.status(400).json({ error: "Webhook invalide ou incomplet" });

    // Vérification HMAC SHA256
    const payload = JSON.stringify({ transactionId, statut });
    const computedHash = cryptoJs.HmacSHA256(payload, FEDAPAY_SECRET_KEY).toString();

    if (computedHash !== signature) {
      console.warn("🚨 Signature Fedapay invalide !");
      return res.status(401).json({ error: "Signature non valide" });
    }

    console.log(`🔔 Webhook reçu : ${transactionId} → ${statut}`);

    // Mise à jour avec retry
    const success = await updateTransactionWithRetry(transactionId, statut);

    if (!success) {
      console.error("❌ Échec de mise à jour transaction après plusieurs tentatives");
      return res.status(500).json({ error: "Mise à jour échouée" });
    }

    // Actions selon statut
    switch (statut) {
      case "success":
        console.log(`✅ Paiement ${transactionId} confirmé`);
        // TODO: créditer compte vendeur, notifier buyer/admin
        break;
      case "failed":
        console.log(`❌ Paiement ${transactionId} échoué`);
        break;
      case "canceled":
        console.log(`⚠️ Paiement ${transactionId} annulé`);
        break;
      case "pending":
        console.log(`⌛ Paiement ${transactionId} en attente`);
        break;
      default:
        console.log(`ℹ️ Statut inconnu : ${statut}`);
    }

    return res.json({ message: "Webhook traité avec succès" });
  } catch (err) {
    console.error("Erreur webhook Fedapay:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
