// src/controllers/fedapayController.js

import { supabase } from "../server.js";
import axios from "axios";
import crypto from "crypto"; 
import { addLog } from "./logController.js";
import fedapayService from '../services/fedapayService.js'; // 🥂 NOUVEL IMPORT

// Taux de commission de la plateforme
const PLATFORM_COMMISSION_RATE = 0.10; // 10%

// ⏳ Configuration de la fiabilité
const MAX_RETRY = 3;
const RETRY_DELAY_MS = 2000;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ========================
// Utilitaires de Fiabilité DB
// ========================

/**
 * Tente de mettre à jour le statut d'une transaction interne (anti-doublon).
 * @param {string} fedapayTransactionId - ID de la transaction Fedapay.
 * @param {string} newStatus - Le nouveau statut à appliquer.
 * @returns {object | null} - Les données de la transaction mise à jour ou null.
 */
async function updateTransactionWithRetry(fedapayTransactionId, newStatus) {
  let attempt = 0;
  while (attempt < MAX_RETRY) {
    attempt++;
    
    // Mise à jour de la table 'transactions' en utilisant l'identifiant fournisseur
    const { data, error } = await supabase
      .from("transactions")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("provider_id", fedapayTransactionId)
      // CRITIQUE : Ne mettre à jour que si le statut est 'pending' (anti-doublon/idempotence)
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
// 🎯 1. Initier le paiement d'une COMMANDE (Produit)
// ========================

/**
 * Crée une transaction sur Fedapay et sauvegarde la transaction interne.
 */
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
        // ATTENTION : On utilise total_price si c'est le nom de colonne correct, sinon total_amount
        .select('id, total_price, status, buyer_id') 
        .eq('id', order_id)
        .single();

    if (orderError || !order || order.buyer_id !== buyer_id) {
        return res.status(403).json({ error: "Accès refusé ou commande introuvable." });
    }
    // Mise à jour du statut attendu par orderController.js
    if (order.status !== 'pending_payment') { 
        return res.status(400).json({ error: "Cette commande n'est pas en attente de paiement." });
    }
    
    // 2. Récupérer les Clés Secrète et Publique de la DB
    const { data: provider, error: providerError } = await supabase
        .from("payment_providers")
        .select("secret_key, public_key")
        .eq("name", "fedapay")
        .eq("is_active", true)
        .single();

    if (providerError || !provider) {
          return res.status(503).json({ error: "Le fournisseur de paiement Fedapay n'est pas actif." });
    }
    
    // Déterminer l'environnement
    const env = process.env.NODE_ENV === 'production' ? 'live' : 'sandbox';
    
    // 3. Mise à jour préliminaire du statut à 'processing_payment'
    await supabase.from('orders').update({ status: 'processing_payment' }).eq('id', order_id);

    // 4. --- 💳 APPEL AU SERVICE FEDAPAY AVEC CLÉ DYNAMIQUE ---
    const redirect_url = await fedapayService.createProductOrderLink(
        provider.secret_key, // Clé secrète
        env,
        order.total_price, // Montant réel à payer
        `Paiement pour commande #${order_id}`, 
        order_id,
        buyer_id
    );

    if (!redirect_url) {
        throw new Error("Échec de la connexion à FedaPay ou génération du lien échouée.");
    }

    // 5. Sauvegarder la transaction interne (sera mise à jour par le webhook)
    // NOTE: On insère une transaction 'pending' avant d'envoyer l'utilisateur
    const { error: transactionError } = await supabase.from("transactions").insert([
      {
        user_id: buyer_id,
        provider: 'fedapay',
        provider_id: null, // Sera mis à jour par le webhook
        amount: order.total_price,
        status: "pending",
        description: `Initiation pour commande #${order_id}`,
      },
    ]);
    
    if (transactionError) throw transactionError;

    await addLog(buyer_id, 'PAYMENT_INITIATED', { order_id: order_id, amount: order.total_price });

    return res.json({
      message: "Redirection vers le paiement ✅",
      checkout_url: redirect_url, // URL réelle de redirection FedaPay
      public_key: provider.public_key // Clé publique pour l'intégration frontend
    });

  } catch (err) {
    console.error("Erreur init paiement Fedapay :", err.message);
    // En cas d'échec, remettre la commande à 'pending_payment'
    await supabase.from('orders').update({ status: 'pending_payment' }).eq('id', req.body.order_id);
    res.status(500).json({ error: "Échec de l'initialisation du paiement.", details: err.message });
  }
}

// ========================
// 🔔 2. Webhook Fedapay sécurisé
// ========================

/**
 * Reçoit les événements de Fedapay, vérifie la signature, et gère les flux (Escrow ou Commande).
 */
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
  
  // 2. Vérification HMAC SHA256
  const computedHash = crypto.createHmac('sha256', provider.secret_key)
                             .update(rawBody)
                             .digest('hex');
  
  if (computedHash !== signature) {
    console.warn("🚨 Signature Fedapay invalide !");
    return res.status(401).end(); 
  }

  const { event, data } = req.body; 
  const external_transaction_id = data.id; 
  const metadata = data.metadata || {};
  const flowType = metadata.type; // 'ESCROW_SERVICE' ou 'ORDER_PRODUCT'
  
  if (event !== 'transaction.approved') {
      // Pour les transactions annulées/échouées, mettre à jour le statut dans la DB si nécessaire
      // Logique de gestion des échecs pour les deux types de flux...
      if (flowType === 'ESCROW_SERVICE' && metadata.mission_id) {
          // Remettre la mission à 'open'
          await supabase.from('freelance_missions').update({ status: 'open', seller_id: null, final_price: null }).eq('id', metadata.mission_id);
      } else if (flowType === 'ORDER_PRODUCT' && metadata.order_id) {
          // Remettre la commande à 'pending_payment'
          await supabase.from('orders').update({ status: 'pending_payment' }).eq('id', metadata.order_id);
      }

      if (event === 'transaction.failed' || event === 'transaction.canceled') {
          await addLog(null, `PAYMENT_${event.toUpperCase()}`, { flow: flowType, fedapay_id: external_transaction_id, metadata });
      }

      return res.status(200).end(); 
  }
  
  try {
      
      // 3. Mise à jour de la transaction interne (pour l'idempotence)
      const { error: updateTransError } = await supabase
          .from("transactions")
          .update({ status: 'approved', provider_id: external_transaction_id })
          .eq("provider_id", external_transaction_id) 
          .eq("status", "pending") 
          .single();

      // Si déjà traité ou échec de mise à jour, on ignore (idempotence)
      if (updateTransError) {
          console.warn(`Transaction ${external_transaction_id} déjà traitée ou introuvable.`);
          return res.status(200).end();
      }

      // 4. Distinction des Flux : Services (Escrow) vs Produits (Commande)
      if (flowType === 'ESCROW_SERVICE') {
          
          const mission_id = metadata.mission_id;
          const buyer_id = metadata.buyer_id;

          // Mettre à jour la mission de 'pending_payment' à 'in_progress'
          const { data: updatedMission, error: missionError } = await supabase
              .from('freelance_missions')
              .update({ 
                  status: 'in_progress', 
                  escrow_transaction_id: external_transaction_id // Stocker la référence externe
              })
              .eq('id', mission_id)
              .eq('status', 'pending_payment')
              .select('id, seller_id, final_price')
              .single();

          if (missionError || !updatedMission) {
              console.error("WEBHOOK ERROR: Mission introuvable ou déjà démarrée après paiement:", mission_id);
              await addLog(buyer_id, 'WEBHOOK_MISSION_ERROR', { error: 'Mission status mismatch', mission_id });
              return res.status(500).end(); 
          }
          
          await addLog(buyer_id, 'MISSION_ESCROW_COMPLETED', { mission_id, fedapay_id: external_transaction_id, price: updatedMission.final_price });
          
          
      } else if (flowType === 'ORDER_PRODUCT') {
          
          const order_id = metadata.order_id;

          // Récupérer les articles pour la répartition
          const { data: orderItems, error: itemsError } = await supabase
              .from('order_items')
              .select('seller_id, price, quantity')
              .eq('order_id', order_id);

          if (itemsError || !orderItems || orderItems.length === 0) {
              console.error("WEBHOOK ERROR: Commande payée sans articles :", order_id);
              await addLog(null, 'WEBHOOK_ORDER_ERROR', { error: 'Order items missing after approval', order_id });
              return res.status(500).end(); 
          }
          
          // Calcul et crédit des vendeurs
          const sellerFunds = {};
          let totalCommission = 0;
          
          for (const item of orderItems) {
              const saleAmount = item.price * item.quantity;
              const commission = saleAmount * PLATFORM_COMMISSION_RATE;
              const netAmount = saleAmount - commission;

              sellerFunds[item.seller_id] = (sellerFunds[item.seller_id] || { net: 0 });
              sellerFunds[item.seller_id].net += netAmount;
              totalCommission += commission; 
          }
          
          const creditPromises = [];
          for (const [seller_id, amounts] of Object.entries(sellerFunds)) {
              creditPromises.push(
                  supabase.rpc("increment_wallet_balance", {
                      user_id_param: seller_id, 
                      amount_param: amounts.net,
                      description_param: `Crédit vente commande #${order_id}`
                  })
              );
          }
          
          await Promise.all(creditPromises); 
          
          // Mettre à jour le statut de la commande à 'completed'
          await supabase
              .from('orders')
              .update({ status: 'completed' }) 
              .eq('id', order_id);
          
          await addLog(null, 'ORDER_PAYMENT_COMPLETED', { order_id: order_id, fedapay_id: external_transaction_id, total_commission: totalCommission });
          
      } else {
          console.warn("WEBHOOK ALERT: Type de transaction Fedapay inconnu:", flowType);
      }


      res.status(200).end(); 

  } catch (err) {
      console.error("Fedapay Webhook processing error:", err);
      // Renvoyer 500 pour indiquer à Fedapay de réessayer
      res.status(500).end(); 
  }
        }
                          
