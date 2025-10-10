// src/controllers/fedapayController.js (Mis à jour pour la Marketplace)

import { supabase } from "../server.js";
import axios from "axios";
// NOTE: L'importation du SDK Fedapay (commentée) est la meilleure pratique en production.
// import FedaPay from 'fedapay'; 

// Commission de la plateforme (pour la cohérence)
const PLATFORM_COMMISSION_RATE = 0.10; // 10%

// ========================
// ✅ 1. POST /api/fedapay/init : Initier le paiement d'une COMMANDE
// ========================
export async function initFedapayPayment(req, res) {
  try {
    const buyer_id = req.user.db.id; // Utilisation de req.user.db.id comme convenu
    // On attend l'ID de la commande
    const { order_id } = req.body; 

    if (!order_id) {
        return res.status(400).json({ error: "L'ID de la commande est manquant." });
    }

    // 1. Récupérer les détails de la commande et vérifier la propriété
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
    
    // 2. Récupérer les clés Secrètes Fedapay
    const { data: provider, error: providerError } = await supabase
        .from("payment_providers")
        // On récupère la SECRET_KEY qui est nécessaire pour INITIER la transaction.
        .select("secret_key, is_active")
        .eq("name", "fedapay")
        .single();

    if (providerError || !provider || !provider.is_active) {
          return res.status(503).json({ error: "Le fournisseur de paiement Fedapay n'est pas actif." });
    }

    // --- Appel API Fedapay ---
    
    const response = await axios.post(
      process.env.FEDAPAY_API_URL || "https://sandbox-api.fedapay.com/v1/transactions",
      {
        // On passe les détails de la commande
        description: `Paiement pour commande #${order_id}`,
        amount: order.total_amount,
        currency: "XOF", // Doit être cohérent
        // Le callback_url doit pointer vers notre route de webhook
        callback_url: `${process.env.BASE_URL}/api/fedapay/webhook`, 
        // Ajoutez l'ID de la commande dans les métadonnées si Fedapay le supporte
        // Sinon, on s'appuiera sur la table 'transactions' ci-dessous
      },
      {
        headers: {
          Authorization: `Bearer ${provider.secret_key}`,
          "Content-Type": "application/json",
        },
      }
    );

    const transaction = response.data.transaction;

    // 3. Sauvegarder la transaction avec le lien vers la COMMANDE
    const { error: transactionError } = await supabase.from("transactions").insert([
      {
        user_id: buyer_id,
        order_id: order_id, // ⬅️ Lien critique vers la commande
        provider: "fedapay",
        provider_id: transaction.id,
        amount: order.total_amount,
        status: "pending",
        description: `Initiation pour commande #${order_id}`,
      },
    ]);
    
    if (transactionError) throw transactionError;

    // 4. Mettre à jour la commande à 'processing_payment'
    await supabase.from('orders').update({ status: 'processing_payment' }).eq('id', order_id);


    return res.json({
      message: "Redirection vers le paiement ✅",
      checkout_url: transaction.checkout_url,
    });
  } catch (err) {
    console.error("Init Fedapay payment error:", err.response?.data || err.message);
    return res.status(500).json({
      error: "Erreur serveur lors de l'initialisation du paiement.",
      details: err.response?.data || err.message,
    });
  }
}

// ========================
// 🔔 2. POST /api/fedapay/webhook : Callback Webhook Fedapay
// ========================
export async function handleFedapayWebhook(req, res) {
  // NOTE CRITIQUE : VÉRIFICATION DE LA SIGNATURE OBLIGATOIRE EN PROD
  // if (!FedaPay.Webhook.verify(req.rawBody, signature, secretKey)) return res.status(403).end();
    
  const { event, data } = req.body; 
  
  if (event !== 'transaction.approved') {
      // Nous nous concentrons uniquement sur l'approbation pour créditer les fonds
      return res.status(200).end(); 
  }

  const external_transaction_id = data.id; 
  const payment_status = data.status; 

  if (payment_status !== 'approved') {
      return res.status(200).end(); 
  }

  try {
      // 1. Mettre à jour la transaction et récupérer l'order_id
      // On utilise le UPDATE pour s'assurer qu'on ne traite la transaction qu'une seule fois (même si le webhook est renvoyé).
      const { data: transaction, error: updateError } = await supabase
          .from("transactions")
          .update({ status: payment_status, processed_at: new Date().toISOString() })
          .eq("provider_id", external_transaction_id)
          .eq("status", "pending") // Traiter uniquement les transactions EN ATTENTE
          .select("order_id, amount")
          .single();

      if (updateError || !transaction) {
          // Si la transaction est déjà traitée ou introuvable, on répond OK (200) pour ne pas redemander le webhook.
          return res.status(200).json({ message: "Transaction déjà traitée ou introuvable." });
      }

      const order_id = transaction.order_id;

      // 2. Récupérer les articles de la commande (pour la commission)
      const { data: orderItems, error: itemsError } = await supabase
          .from('order_items')
          .select('seller_id, price, quantity')
          .eq('order_id', order_id);

      if (itemsError || !orderItems || orderItems.length === 0) {
          // Log critique : Paiement OK mais articles manquants. L'Admin doit intervenir.
          console.error("WEBHOOK ERROR: Paid order has no items:", order_id);
          // On ne fait rien d'autre, mais l'état de la commande restera 'processing_payment'
          return res.status(500).end(); 
      }
      
      // 3. Traitement des fonds et crédits
      const sellerFunds = {};
      
      orderItems.forEach(item => {
          const saleAmount = item.price * item.quantity;
          const commission = saleAmount * PLATFORM_COMMISSION_RATE;
          const netAmount = saleAmount - commission;

          // Crédit net pour le vendeur
          sellerFunds[item.seller_id] = (sellerFunds[item.seller_id] || 0) + netAmount;
      });
      
      // 4. Créditer les portefeuilles des vendeurs (Atomicité)
      for (const [seller_id, netAmount] of Object.entries(sellerFunds)) {
          // Appel du RPC pour incrémenter le solde
          await supabase.rpc("increment_wallet_balance", {
              user_id: seller_id,
              amount: netAmount
          });

          // Enregistrement de la transaction de crédit
          await supabase.from("transactions").insert({
              user_id: seller_id,
              amount: netAmount,
              description: `Crédit vente commande #${order_id}`,
              status: 'approved',
              provider: 'internal_wallet'
          });
      }
      
      // 5. Mettre à jour le statut de la commande à 'completed'
      await supabase
          .from('orders')
          .update({ status: 'completed', payment_date: new Date().toISOString() })
          .eq('id', order_id);

      res.status(200).end(); 

  } catch (err) {
      console.error("Fedapay Webhook processing error:", err);
      // Renvoyer 500 pour indiquer à Fedapay de réessayer la notification
      res.status(500).end(); 
  }
}
