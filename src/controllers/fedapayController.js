 // src/controllers/fedapayController.js (FINALE VERSION ET CORRIGÉE)

import { supabase } from "../server.js";
import axios from "axios";
// ➡️ COHÉRENCE : Utiliser uniquement le module natif 'crypto'
import crypto from "crypto"; 
// Import des utilitaires de log (pour traçabilité)
import { addLog } from "./logController.js";

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

    if (!error) return data; 
    
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
    const { order_id } = req.body; 

    if (!order_id) {
        return res.status(400).json({ error: "L'ID de la commande est manquant." });
    }

    // 1. Récupérer Commande
    const { data: order, error: orderError } = await supabase
        .from('orders')
        // ➡️ COHÉRENCE : Utilisation de 'total_price'
        .select('id, total_price, status, buyer_id')
        .eq('id', order_id)
        .single();

    if (orderError || !order || order.buyer_id !== buyer_id) {
        return res.status(403).json({ error: "Accès refusé ou commande introuvable." });
    }
    if (order.status !== 'pending_payment') {
        return res.status(400).json({ error: "Cette commande n'est pas en attente de paiement." });
    }
    
    // 2. Récupérer la Clé Secrète (Config Fedapay)
    const { data: provider, error: providerError } = await supabase
        .from("payment_providers")
        .select("secret_key, public_key, name")
        .eq("name", "fedapay")
        .eq("is_active", true)
        .single();

    if (providerError || !provider) {
          return res.status(503).json({ error: "Le fournisseur de paiement Fedapay n'est pas actif." });
    }

    // --- Appel API Fedapay ---
    const payload = {
      description: `Paiement pour commande #${order_id}`,
      amount: order.total_price, // ➡️ COHÉRENCE : Utilisation de 'total_price'
      currency: "XOF", 
      metadata: {
        buyer_id: buyer_id,
        order_id: order_id,
      },
      callback_url: `${process.env.BASE_URL}/api/fedapay/webhook`, 
    };
    
    const fedapayResponse = await axios.post(
        process.env.FEDAPAY_API_URL || "https://sandbox-api.fedapay.com/v1/transactions", 
        payload,
        {
          headers: {
            "Authorization": `Bearer ${provider.secret_key}`, 
            "Content-Type": "application/json",
          },
        }
    );

    const transaction = fedapayResponse.data.transaction;
    
    // 3. Sauvegarder la transaction externe
    const { error: transactionError } = await supabase.from("transactions").insert([
      {
        user_id: buyer_id,
        order_id: order_id, 
        provider: provider.name,
        provider_id: transaction.id, // ID Fedapay
        amount: order.total_price,
        status: "pending",
        description: `Initiation pour commande #${order_id}`,
      },
    ]);
    
    if (transactionError) throw transactionError;

    // 4. Mettre à jour la commande
    await supabase.from('orders').update({ status: 'processing_payment', external_transaction_id: transaction.id }).eq('id', order_id);
    await addLog(buyer_id, 'PAYMENT_INITIATED', { order_id: order_id, fedapay_id: transaction.id, amount: order.total_price });


    return res.json({
      message: "Redirection vers le paiement ✅",
      transactionId: transaction.id,
      checkout_url: transaction.checkout_url,
      public_key: provider.public_key // Retourner la clé publique pour le frontend
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
  // ⚠️ CRITIQUE : Le middleware doit avoir mis le corps brut dans req.rawBody
  const rawBody = req.rawBody;
  const signature = req.headers["x-fedapay-signature"];
  
  if (!signature || !rawBody) {
      console.warn("🚨 Webhook sans signature ou corps brut !");
      return res.status(401).end();
  }

  // 1. Récupérer la Clé Secrète pour la vérification
  const { data: provider, error: providerError } = await supabase
      .from("payment_providers")
      .select("secret_key")
      .eq("name", "fedapay")
      .single();

  if (providerError || !provider) {
      console.error("Clé secrète Fedapay non trouvée pour vérification.");
      return res.status(500).end(); 
  }
  
  // 2. Vérification HMAC SHA256 (Utilisation du module 'crypto' natif)
  const computedHash = crypto.createHmac('sha256', provider.secret_key)
                             .update(rawBody)
                             .digest('hex');
  
  if (computedHash !== signature) {
    console.warn("🚨 Signature Fedapay invalide !");
    return res.status(401).end(); 
  }

  const { event, data } = req.body; 
  const external_transaction_id = data.id; 
  const order_id = data.metadata?.order_id;
  const total_amount_paid = data.amount;

  if (event !== 'transaction.approved') {
      // Ignorer tous les autres événements
      return res.status(200).end(); 
  }
  
  try {
      // 3. Mise à jour avec Retry, et récupération de l'order_id
      const transactionData = await updateTransactionWithRetry(external_transaction_id, 'completed');

      if (!transactionData) {
          return res.status(200).json({ message: "Transaction déjà traitée ou échec de mise à jour (ignorer)." });
      }

      // 4. Récupérer les articles de la commande (pour la commission et la répartition)
      const { data: orderItems, error: itemsError } = await supabase
          .from('order_items')
          .select('seller_id, price, quantity')
          .eq('order_id', order_id);

      if (itemsError || !orderItems || orderItems.length === 0) {
          console.error("WEBHOOK ERROR: Commande payée sans articles :", order_id);
          await addLog(null, 'WEBHOOK_ERROR', { error: 'Order items missing after approval', order_id });
          return res.status(500).end(); 
      }
      
      // 5. Traitement des fonds, calcul de la commission et crédits
      const sellerFunds = {};
      let totalCommission = 0;
      
      for (const item of orderItems) {
          const saleAmount = item.price * item.quantity;
          const commission = saleAmount * PLATFORM_COMMISSION_RATE;
          const netAmount = saleAmount - commission;

          sellerFunds[item.seller_id] = (sellerFunds[item.seller_id] || { net: 0, commission: 0 });
          sellerFunds[item.seller_id].net += netAmount;
          sellerFunds[item.seller_id].commission += commission;
          totalCommission += commission;
      }
      
      // 6. Enregistrer la transaction de COMMISSION et les crédits aux vendeurs (RPC)
      const commissionRecords = [];
      const walletTxRecords = [];

      for (const [seller_id, amounts] of Object.entries(sellerFunds)) {
          // a) Enregistrer la commission
          commissionRecords.push({
              order_id: order_id,
              seller_id: seller_id,
              amount: amounts.commission,
              rate: PLATFORM_COMMISSION_RATE,
          });

          // b) Créditer le portefeuille du vendeur
          await supabase.rpc("increment_wallet_balance", {
              user_id_param: seller_id,
              amount_param: amounts.net
          });
          
          // c) Enregistrement de la transaction de crédit dans la table interne 'wallet_transactions'
          walletTxRecords.push({
              user_id: seller_id,
              amount: amounts.net,
              description: `Crédit vente commande #${order_id}`,
              type: 'credit', // Type interne pour le wallet
              status: 'completed',
              order_id: order_id
          });
      }
      
      await Promise.all([
          // Enregistrer toutes les commissions
          supabase.from("commissions").insert(commissionRecords),
          // Enregistrer toutes les transactions de portefeuille
          supabase.from("wallet_transactions").insert(walletTxRecords),
          // Log de l'événement
          addLog(null, 'PAYMENT_COMPLETED', { order_id: order_id, fedapay_id: external_transaction_id, total_commission: totalCommission })
      ]);
      
      // 7. Mettre à jour le statut de la commande à 'completed'
      await supabase
          .from('orders')
          .update({ status: 'completed', payment_date: new Date().toISOString(), commission_total: totalCommission })
          .eq('id', order_id);

      res.status(200).end(); 

  } catch (err) {
      console.error("Fedapay Webhook processing error:", err);
      // Renvoyer 500 pour indiquer à Fedapay de réessayer
      res.status(500).end(); 
  }
      }
    
