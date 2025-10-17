// src/controllers/fedapayController.js

import { supabase } from "../server.js";
import axios from "axios";
import crypto from "crypto"; 
import { addLog } from "./logController.js";
import fedapayService from '../services/fedapayService.js'; 

// ========================
// 🎯 1. Initier le paiement d'une COMMANDE (Produit)
// ========================

/**
 * Crée une transaction sur Fedapay et sauvegarde la transaction interne.
 */
export async function initFedapayPayment(req, res) {
  try {
    const buyer_id = req.user.db.id; // ID utilisateur extrait de authMiddleware
    const { order_id } = req.body; 

    if (!order_id) {
        return res.status(400).json({ error: "L'ID de la commande est manquant." });
    }

    // 1. Récupérer Commande 
    const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('id, total_amount, status, buyer_id') 
        .eq('id', order_id)
        .single();

    if (orderError || !order || order.buyer_id !== buyer_id) {
        return res.status(403).json({ error: "Accès refusé ou commande introuvable." });
    }
    
    if (order.status !== 'pending') { 
        return res.status(400).json({ error: `Cette commande est au statut : ${order.status}. Le paiement n'est pas nécessaire.` });
    }
    
    // 2. Récupérer les Clés Secrète et Publique de la DB (gérées par l'admin)
    const { data: provider, error: providerError } = await supabase
        .from("payment_providers")
        .select("secret_key, public_key")
        .eq("name", "fedapay")
        .eq("is_active", true)
        .single();

    if (providerError || !provider) {
          return res.status(503).json({ error: "Le fournisseur de paiement Fedapay n'est pas actif." });
    }
    
    const env = process.env.NODE_ENV === 'production' ? 'live' : 'sandbox';
    
    // 3. Mise à jour préliminaire du statut pour éviter les tentatives multiples (Idempotence)
    await supabase.from('orders').update({ status: 'processing_payment' }).eq('id', order_id);

    // 4. --- 💳 APPEL AU SERVICE FEDAPAY POUR CRÉER LA TRANSACTION ---
    // La logique d'appel API est encapsulée dans le service
    const redirect_url = await fedapayService.createProductOrderLink(
        provider.secret_key, 
        env,
        order.total_amount,
        `Paiement pour commande #${order_id}`, 
        order_id,
        buyer_id
    );

    if (!redirect_url) {
        throw new Error("Génération du lien FedaPay échouée.");
    }

    // 5. Sauvegarder la transaction interne
    // L'ID FedaPay (provider_id) sera mis à jour par le webhook
    const { error: transactionError } = await supabase.from("transactions").insert([
      {
        user_id: buyer_id,
        provider: 'fedapay',
        provider_id: null, 
        amount: order.total_amount,
        status: "pending",
        description: `Initiation pour commande #${order_id}`,
      },
    ]);
    
    if (transactionError) throw transactionError;

    await addLog(buyer_id, 'PAYMENT_INITIATED', { order_id: order_id, amount: order.total_amount });

    return res.json({
      message: "Redirection vers le paiement ✅",
      checkout_url: redirect_url,
      public_key: provider.public_key 
    });

  } catch (err) {
    console.error("Erreur init paiement Fedapay :", err.message);
    // En cas d'échec, remettre la commande à 'pending'
    await supabase.from('orders').update({ status: 'pending' }).eq('id', req.body.order_id);
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
  // Le middleware 'rawBodyMiddleware' doit avoir inséré le corps brut ici.
  const rawBody = req.rawBody;
  const signature = req.headers["x-fedapay-signature"];
  
  if (!signature || !rawBody) {
      console.warn("🚨 Webhook sans signature ou corps brut !");
      return res.status(401).end();
  }

  // 1. Récupérer la Clé Secrète pour la vérification HMAC
  const { data: provider, error: providerError } = await supabase
      .from("payment_providers")
      .select("secret_key")
      .eq("name", "fedapay")
      .single();

  if (providerError || !provider) {
      console.error("Clé secrète Fedapay non trouvée pour vérification.");
      return res.status(500).end(); 
  }
  
  // 2. Vérification HMAC SHA256 (Sécurité critique)
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
  
  // --- Gestion des Échecs/Annulations ---
  if (event !== 'transaction.approved') {
      
      const statusDB = event === 'transaction.failed' ? 'failed' : 'canceled';
      
      const { data: failedTrans } = await supabase
          .from("transactions")
          // Mettre à jour la transaction par l'ID Fedapay si elle est en attente
          .update({ status: statusDB, provider_id: external_transaction_id })
          .eq("provider_id", external_transaction_id) 
          .eq("status", "pending")
          .select("user_id")
          .single();

      // Remettre le statut de la ressource à l'état initial
      if (flowType === 'ESCROW_SERVICE' && metadata.mission_id) {
          // Si paiement Escrow échoue, mission revient à 'open'
          await supabase.from('freelance_missions').update({ status: 'open', seller_id: null, final_price: null }).eq('id', metadata.mission_id);
      } else if (flowType === 'ORDER_PRODUCT' && metadata.order_id) {
          // Si paiement Commande échoue, commande revient à 'pending'
          await supabase.from('orders').update({ status: 'pending' }).eq('id', metadata.order_id);
      }

      await addLog(failedTrans?.user_id || null, `PAYMENT_${event.toUpperCase()}`, { flow: flowType, fedapay_id: external_transaction_id, metadata });

      return res.status(200).end(); 
  }
  
  // --- Gestion du Succès (transaction.approved) ---
  try {
      
      // 3. Mise à jour de la transaction interne (pour l'idempotence)
      const { data: updatedTransaction, error: updateTransError } = await supabase
          .from("transactions")
          .update({ status: 'approved', provider_id: external_transaction_id })
          // Cible la ligne 'pending' par l'ID Fedapay 
          .eq("provider_id", external_transaction_id) 
          .eq("status", "pending") 
          .select("id, user_id") 
          .single();

      // Si déjà traité ou introuvable (idempotence)
      if (updateTransError || !updatedTransaction) {
          console.warn(`Transaction ${external_transaction_id} déjà traitée ou introuvable.`);
          return res.status(200).end();
      }
      
      const internal_transaction_id = updatedTransaction.id;
      const buyer_id = updatedTransaction.user_id;

      // 4. Distinction des Flux et Traitement
      if (flowType === 'ESCROW_SERVICE') {
          
          const mission_id = metadata.mission_id;
          
          // L'argent est sécurisé. On met à jour la mission et on lie l'Escrow à la transaction interne.
          const { data: updatedMission, error: missionError } = await supabase
              .from('freelance_missions')
              .update({ 
                  status: 'in_progress', 
                  escrow_transaction_id: internal_transaction_id // L'argent est séquestré via cette transaction interne
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
          
          // Distribution des fonds, création des commissions, mise à jour du statut de la commande
          // C'est le service qui gère la logique de crédit des vendeurs
          const totalCommission = await fedapayService.distributeOrderFunds(order_id, internal_transaction_id); 
          
          await addLog(buyer_id, 'ORDER_PAYMENT_COMPLETED', { order_id: order_id, fedapay_id: external_transaction_id, total_commission: totalCommission });
          
      } else {
          console.warn("WEBHOOK ALERT: Type de transaction Fedapay inconnu:", flowType);
      }


      res.status(200).end(); 

  } catch (err) {
      console.error("Fedapay Webhook processing error:", err);
      // Renvoyer 500 pour que Fedapay retente l'appel
      res.status(500).end(); 
  }
      }
        
