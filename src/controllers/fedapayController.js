// src/controllers/fedapayController.js
import crypto from "crypto";
import { supabase } from "../server.js";
import fedapayService from "../services/fedapayService.js";
import { addLog } from "./logController.js"; // CORRIGÉ : chemin relatif au dossier controllers

// ===============================
// ⚙️ Variables Globales
// ===============================
const FEDAPAY_WEBHOOK_SECRET = process.env.FEDAPAY_WEBHOOK_SECRET;

// =======================================================
// 🟢 Initialisation du paiement de commande (produits)
// =======================================================
export const initFedapayPayment = async (req, res) => {
  try {
    const { amount, description, orderId, buyerId } = req.body;
    if (!amount || !description || !orderId || !buyerId) {
      return res.status(400).json({ error: "Champs manquants" });
    }

    // 🔑 Récupération dynamique de la configuration Fedapay
    const { data: config, error: cfgError } = await supabase
      .from("fedapay_config")
      .select("api_key, environment")
      .single();

    if (cfgError || !config) {
      throw new Error("Configuration FedaPay introuvable");
    }

    // 💰 Création du lien de paiement
    const paymentUrl = await fedapayService.createProductOrderLink(
      config.api_key,
      config.environment,
      amount,
      description,
      orderId,
      buyerId
    );

    // 💾 Enregistrement d’une transaction en attente
    await supabase.from("transactions").insert([
      {
        provider: "fedapay",
        provider_reference: orderId,
        type: "order",
        amount,
        buyer_id: buyerId,
        status: "pending",
      },
    ]);

    res.status(200).json({ url: paymentUrl });
  } catch (err) {
    console.error("❌ Erreur initFedapayPayment:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// =======================================================
// 🔵 Webhook Fedapay (paiement réussi, échec, escrow…)
// =======================================================
export const handleFedapayWebhook = async (req, res) => {
  try {
    const rawBody = req.rawBody;
    const signature = req.headers["x-fedapay-signature"];

    // ✅ Vérification sécurisée de la signature HMAC
    const computedHash = crypto
      .createHmac("sha256", FEDAPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    const validSignature =
      signature &&
      crypto.timingSafeEqual(
        Buffer.from(signature, "utf8"),
        Buffer.from(computedHash, "utf8")
      );

    if (!validSignature) {
      console.warn("🚨 Signature FedaPay invalide !");
      return res.status(401).end();
    }

    const event = JSON.parse(rawBody);
    const data = event.data || {};
    const metadata = data.metadata || {};

    await addLog(null, "FEDAPAY_WEBHOOK", {
      event: event.type,
      metadata,
      provider_id: data.id,
    });

    // ==============================
    // 🎯 ROUTAGE DES FLUX MÉTADATA
    // ==============================
    if (metadata.type === "ORDER_PRODUCT") {
      await processOrderTransaction(data, metadata);
    } else if (metadata.type === "ESCROW_SERVICE") {
      await processEscrowTransaction(data, metadata);
    } else {
      console.warn("⚠️ Type de transaction non reconnu:", metadata.type);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error("❌ Erreur Webhook FedaPay:", err.message);
    res.status(500).json({ error: "Erreur interne Webhook" });
  }
};

// =======================================================
// 🧩 Processus des transactions de commande produit
// =======================================================
async function processOrderTransaction(data, metadata) {
  const { id: provider_transaction_id, status, amount } = data;
  const { order_id, buyer_id } = metadata;

  if (status !== "approved") {
    console.log(`⚠️ Transaction non approuvée: ${status}`);
    return;
  }

  // Vérifier si la transaction existe déjà
  const { data: existing } = await supabase
    .from("transactions")
    .select("id")
    .eq("provider_reference", provider_transaction_id)
    .single();

  if (existing) {
    console.log("⚠️ Transaction déjà traitée, ignorée.");
    return;
  }

  // Créer la transaction
  const { data: tx, error: txError } = await supabase
    .from("transactions")
    .insert([
      {
        provider: "fedapay",
        provider_reference: provider_transaction_id,
        type: "order",
        amount,
        buyer_id,
        status: "success",
      },
    ])
    .select()
    .single();

  if (txError) throw txError;

  // Distribuer les fonds aux vendeurs
  const commission = await fedapayService.distributeOrderFunds(
    order_id,
    tx.id
  );

  await addLog(buyer_id, "ORDER_COMPLETED", {
    order_id,
    amount,
    commission,
    transaction_id: tx.id,
  });
}

// =======================================================
// 🧩 Processus des transactions d’escrow (missions freelance)
// =======================================================
async function processEscrowTransaction(data, metadata) {
  const { id: provider_transaction_id, status, amount } = data;
  const { mission_id, buyer_id } = metadata;

  if (status !== "approved") {
    console.log(`⚠️ Escrow non approuvé: ${status}`);
    return;
  }

  // Vérifier duplication
  const { data: existing } = await supabase
    .from("transactions")
    .select("id")
    .eq("provider_reference", provider_transaction_id)
    .single();

  if (existing) {
    console.log("⚠️ Escrow déjà enregistré, ignoré.");
    return;
  }

  // Enregistrer le séquestre
  await supabase.from("transactions").insert([
    {
      provider: "fedapay",
      provider_reference: provider_transaction_id,
      type: "escrow",
      amount,
      buyer_id,
      status: "held",
    },
  ]);

  // Mettre la mission en statut “en cours”
  await supabase
    .from("freelance_missions")
    .update({ status: "in_progress", escrow_status: "held" })
    .eq("id", mission_id);

  await addLog(buyer_id, "ESCROW_INITIATED", {
    mission_id,
    amount,
    provider_transaction_id,
  });
}
