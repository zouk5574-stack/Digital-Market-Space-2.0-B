// src/controllers/fedapayController.js (FINALE VERSION)

import { supabase } from "../server.js";
import axios from "axios";
import crypto from "crypto";
import cryptoJs from "crypto-js"; // Pour la vérification HMAC

// Taux de commission de la plateforme
const PLATFORM_COMMISSION_RATE = 0.10; // 10%

// ⏳ Configuration de la fiabilité
const MAX_RETRY = 3;
const RETRY_DELAY_MS = 2000;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ========================
// Utilitaires de Fiabilité DB
// ========================

// Retry utilitaire pour mise à jour transaction
async function updateTransactionWithRetry(fedapayTransactionId, newStatus) {
  let attempt = 0;
  while (attempt < MAX_RETRY) {
    attempt++;
    // Mise à jour de la table 'transactions' en utilisant l'identifiant fournisseur
    const { data, error } = await supabase
      .from("transactions")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("provider_id", fedapayTransactionId)
      // Ne mettre à jour que si le statut est 'pending' (anti-doublon)
      .eq("status", "pending") 
      .select("order_id")
      .single();

    if (!error) return data; // Retourne l'order_id si successful
    
    console.error(`⚠️ Tentative ${attempt}/${MAX_RETRY} échouée pour T-ID ${fedapayTransactionId} :`, error.message);
    if (attempt < MAX_RETRY) await delay(RETRY_DELAY_MS);
  }
  return null;
}

// ========================
// 🎯 1. Initier le paiement d'une COMMANDE
// ========================
export async function initFedapayPayment(req, res) {
  try {
    const buyer_id = req.user.db.id;
    // On attend l'ID de la commande, pas seulement un montant
    const { order_id } = req.body; 

    if (!order_id) {
        return res.status(400).json({ error: "L'ID de la commande est manquant." });
    }

    // 1. Récupérer Commande et vérifier la propriété
    const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('id, total_amount, status, buyer_id')
        .eq('id', order_id)
        .single();

    if (orderError || !order || order.buyer_id !== buyer_id) {
        return res.status(403).json({ error: "Accès refusé ou commande introuvable." });
    }
    if (order.status !== 'pending_payment') {
        return res.status(400).json({ error: "Cette commande n'est pas en attente de paiement." });
    }
    
    // 2. Récupérer la Clé Secrète (Gestion Admin)
    const { data: provider, error: providerError } = await supabase
        .from("payment_providers")
        .select("secret_key, name")
        .eq("name", "fedapay")
        .eq("is_active", true)
        .single();

    if (providerError || !provider) {
          return res.status(503).json({ error: "Le fournisseur de paiement Fedapay n'est pas actif." });
    }

    // --- Appel API Fedapay ---
    const payload = {
      description: `Paiement pour commande #${order_id}`,
      amount: order.total_amount,
      currency: "XOF", // Assumer XOF ou le récupérer de la commande
      metadata: {
        buyer_id: buyer_id,
        order_id: order_id,
      },
      // Webhook doit pointer vers notre route
      callback_url: `${process.env.BASE_URL}/api/fedapay/webhook`, 
    };
    
    // Utiliser la clé secrète de la DB
    const fedapayResponse = await axios.post(
        process.env.FEDAPAY_API_URL || "https://sandbox-api.fedapay.com/v1/transactions", 
        payload,
        {
          headers: {
            "Authorization": `Bearer ${provider.secret_key}`, // ⬅️ Utilisation de la clé de la DB
            "Content-Type": "application/json",
          },
        }
    );

    const transaction = fedapayResponse.data.transaction;
    
    // 3. Sauvegarder la transaction avec le lien vers la COMMANDE
    const { error: transactionError } = await supabase.from("transactions").insert([
      {
        user_id: buyer_id,
        order_id: order_id, // ⬅️ Lien critique
        provider: provider.name,
        provider_id: transaction.id, // ID Fedapay
        amount: order.total_amount,
        status: "pending",
        description: `Initiation pour commande #${order_id}`,
      },
    ]);
    
    if (transactionError) throw transactionError;

    // 4. Mettre à jour la commande à 'processing_payment'
    await supabase.from('orders').update({ status: 'processing_payment', external_transaction_id: transaction.id }).eq('id', order_id);


    return res.json({
      message: "Redirection vers le paiement ✅",
      transactionId: transaction.id,
      checkout_url: transaction.checkout_url,
    });
  } catch (err) {
    console.error("Erreur init paiement Fedapay :", err.response?.data || err.message);
    res.status(500).json({ error: "Échec de l'initialisation du paiement.", details: err.response?.data || err.message });
  }
}

// ========================
// 🔔 2. Webhook Fedapay sécurisé
// ========================
export async function handleFedapayWebhook(req, res) {
  // ⚠️ CRITIQUE : Récupérer le corps brut (rawBody) pour la vérification de la signature
  // Ceci nécessite une configuration du middleware express avant cette route : 
  // app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));
  const rawBody = req.rawBody || JSON.stringify(req.body);
  const signature = req.headers["x-fedapay-signature"];
  
  if (!signature) {
      console.warn("🚨 Webhook sans signature !");
      return res.status(401).end();
  }

  // 1. Récupérer la Clé Secrète pour la vérification
  const { data: provider, error: providerError } = await supabase
      .from("payment_providers")
      .select("secret_key")
      .eq("name", "fedapay")
      .eq("is_active", true)
      .single();

  if (providerError || !provider) {
      console.error("Clé secrète Fedapay non trouvée pour vérification.");
      return res.status(500).end(); 
  }
  
  // 2. Vérification HMAC SHA256
  // Le hachage doit être fait sur le corps brut (rawBody)
  const computedHash = cryptoJs.HmacSHA256(rawBody, provider.secret_key).toString(cryptoJs.enc.Hex);
  
  if (computedHash !== signature) {
    console.warn("🚨 Signature Fedapay invalide ! Computed Hash:", computedHash, "Received:", signature);
    return res.status(401).end(); // Répondre 401 pour indiquer à Fedapay que la signature est mauvaise
  }

  // Si la vérification passe, on traite les données
  const { event, data } = req.body; 
  
  if (event !== 'transaction.approved') {
      return res.status(200).end(); 
  }
  
  const external_transaction_id = data.id; 
  const payment_status = data.status; // Devrait être 'approved' si event='transaction.approved'

  try {
      // 3. Mise à jour avec Retry, et récupération de l'order_id
      const transactionData = await updateTransactionWithRetry(external_transaction_id, payment_status);

      if (!transactionData) {
          // Si la transaction n'est pas 'pending' ou si la mise à jour échoue après retry
          return res.status(200).json({ message: "Transaction déjà traitée ou échec de mise à jour." });
      }

      const order_id = transactionData.order_id;

      // 4. Récupérer les articles de la commande (pour la commission)
      const { data: orderItems, error: itemsError } = await supabase
          .from('order_items')
          .select('seller_id, price, quantity')
          .eq('order_id', order_id);

      if (itemsError || !orderItems || orderItems.length === 0) {
          console.error("WEBHOOK ERROR: Commande payée sans articles :", order_id);
          return res.status(500).end(); 
      }
      
      // 5. Traitement des fonds et crédits des Vendeurs
      const sellerFunds = {};
      
      orderItems.forEach(item => {
          const saleAmount = item.price * item.quantity;
          const commission = saleAmount * PLATFORM_COMMISSION_RATE;
          const netAmount = saleAmount - commission;

          sellerFunds[item.seller_id] = (sellerFunds[item.seller_id] || 0) + netAmount;
      });
      
      // 6. Créditer les portefeuilles (Atomicité via RPC)
      for (const [seller_id, netAmount] of Object.entries(sellerFunds)) {
          await supabase.rpc("increment_wallet_balance", {
              user_id: seller_id,
              amount: netAmount
          });

          // Enregistrement de la transaction de crédit
          await supabase.from("transactions").insert({
              user_id: seller_id,
              amount: netAmount,
              description: `Crédit vente commande #${order_id}`,
              status: 'completed',
              provider: 'internal_wallet'
          });
      }
      
      // 7. Mettre à jour le statut de la commande à 'completed'
      await supabase
          .from('orders')
          .update({ status: 'completed', payment_date: new Date().toISOString() })
          .eq('id', order_id);

      res.status(200).end(); 

  } catch (err) {
      console.error("Fedapay Webhook processing error:", err);
      // Renvoyer 500 pour indiquer à Fedapay de réessayer
      res.status(500).end(); 
  }
}
