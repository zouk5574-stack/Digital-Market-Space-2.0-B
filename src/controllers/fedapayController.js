import { supabase } from '../config/supabase.js';
import Joi from 'joi';
import fedapayService from '../services/fedapayService.js';

// =======================================================
// 🟢 Initialisation paiement PRODUITS
// =======================================================
export const initFedapayPayment = async (req, res) => {
  try {
    const { error, value } = Joi.object({
      amount: Joi.number().min(100).required(),
      description: Joi.string().max(255).required(),
      order_id: Joi.string().uuid().required(),
      currency: Joi.string().valid('XOF', 'EUR', 'USD').default('XOF')
    }).validate(req.body);

    if (error) {
      return res.status(400).json({ 
        error: "Données invalides", 
        details: error.details[0].message 
      });
    }

    const { amount, description, order_id, currency } = value;

    // Vérifications métier
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, status, total_amount, user_id")
      .eq("id", order_id)
      .eq("user_id", req.user.id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: "Commande non trouvée" });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({ error: "Commande déjà traitée" });
    }

    // 🎯 APPEL RÉEL FEDAPAY AVEC SDK
    const fedapayResult = await fedapayService.createProductPayment(
      amount,
      description,
      order_id,
      req.user.id,
      currency
    );

    if (!fedapayResult.success) {
      throw new Error(fedapayResult.error);
    }

    const { transaction, payment_url, transaction_id } = fedapayResult;

    // Sauvegarde session paiement
    const { data: session, error: sessionError } = await supabase
      .from("payment_sessions")
      .insert({
        user_id: req.user.id,
        order_id: order_id,
        amount: amount,
        currency: currency,
        provider: "fedapay",
        provider_session_id: transaction_id,
        provider_transaction_id: transaction_id,
        session_data: transaction,
        status: "pending",
        expires_at: new Date(Date.now() + 30 * 60 * 1000)
      })
      .select()
      .single();

    if (sessionError) throw sessionError;

    // Mise à jour commande
    await supabase
      .from("orders")
      .update({ status: "payment_pending" })
      .eq("id", order_id);

    // Log
    await logAction(req.user.id, "FEDAPAY_PAYMENT_INITIATED", {
      order_id,
      amount,
      currency,
      fedapay_transaction_id: transaction_id,
      session_id: session.id
    });

    res.status(200).json({ 
      success: true,
      data: {
        payment_url: payment_url,
        session_id: session.id,
        transaction_id: transaction_id,
        expires_at: session.expires_at
      }
    });

  } catch (err) {
    console.error("❌ Erreur initFedapayPayment:", err);
    res.status(500).json({ 
      error: err.message || "Erreur initialisation paiement",
      code: "PAYMENT_INIT_ERROR"
    });
  }
};

// =======================================================
// 🟢 Initialisation paiement ESCROW
// =======================================================
export const initFedapayEscrowPayment = async (req, res) => {
  try {
    const { error, value } = Joi.object({
      amount: Joi.number().min(100).required(),
      mission_id: Joi.string().uuid().required(),
      description: Joi.string().max(255).required(),
      currency: Joi.string().valid('XOF', 'EUR', 'USD').default('XOF')
    }).validate(req.body);

    if (error) {
      return res.status(400).json({ 
        error: "Données invalides", 
        details: error.details[0].message 
      });
    }

    const { amount, mission_id, description, currency } = value;

    // Vérifications mission
    const { data: mission, error: missionError } = await supabase
      .from("freelance_missions")
      .select("id, status, client_id, freelancer_id, budget, title")
      .eq("id", mission_id)
      .eq("client_id", req.user.id)
      .single();

    if (missionError || !mission) {
      return res.status(404).json({ error: "Mission non trouvée" });
    }

    if (mission.status !== 'accepted') {
      return res.status(400).json({ error: "Mission non éligible au paiement" });
    }

    // 🎯 APPEL RÉEL FEDAPAY ESCROW AVEC SDK
    const fedapayResult = await fedapayService.createEscrowPayment(
      amount,
      description,
      mission_id,
      req.user.id,
      mission.freelancer_id,
      currency
    );

    if (!fedapayResult.success) {
      throw new Error(fedapayResult.error);
    }

    const { transaction, payment_url, transaction_id } = fedapayResult;

    // Sauvegarde session escrow
    const { data: session, error: sessionError } = await supabase
      .from("payment_sessions")
      .insert({
        user_id: req.user.id,
        mission_id: mission_id,
        amount: amount,
        currency: currency,
        provider: "fedapay",
        provider_session_id: transaction_id,
        provider_transaction_id: transaction_id,
        session_data: transaction,
        type: "escrow",
        status: "pending",
        expires_at: new Date(Date.now() + 30 * 60 * 1000)
      })
      .select()
      .single();

    if (sessionError) throw sessionError;

    // Mise à jour mission
    await supabase
      .from("freelance_missions")
      .update({ 
        status: "escrow_pending",
        escrow_transaction_id: transaction_id
      })
      .eq("id", mission_id);

    // Log
    await logAction(req.user.id, "FEDAPAY_ESCROW_INITIATED", {
      mission_id,
      amount,
      currency,
      fedapay_transaction_id: transaction_id,
      session_id: session.id,
      freelancer_id: mission.freelancer_id
    });

    res.status(200).json({ 
      success: true,
      data: {
        payment_url: payment_url,
        session_id: session.id,
        transaction_id: transaction_id,
        expires_at: session.expires_at,
        type: "escrow"
      }
    });

  } catch (err) {
    console.error("❌ Erreur initFedapayEscrowPayment:", err);
    res.status(500).json({ 
      error: err.message || "Erreur initialisation escrow",
      code: "ESCROW_INIT_ERROR"
    });
  }
};

// =======================================================
// 🔵 Webhook FedaPay (VRAI TRAITEMENT)
// =======================================================
export const handleFedapayWebhook = async (req, res) => {
  try {
    const rawBody = req.rawBody;
    const signature = req.headers['x-fedapay-signature'];

    if (!rawBody || !signature) {
      return res.status(400).json({ error: "Signature ou body manquant" });
    }

    // 🎯 VÉRIFICATION RÉELLE SIGNATURE
    const isValid = fedapayService.verifyWebhookSignature(rawBody, signature);
    
    if (!isValid) {
      await logAction(null, "FEDAPAY_WEBHOOK_SIGNATURE_INVALID", {
        ip: req.ip,
        user_agent: req.get('User-Agent')
      });
      return res.status(401).json({ error: "Signature invalide" });
    }

    const event = JSON.parse(rawBody);
    const { type: eventType, data: transaction } = event;

    await logAction(null, "FEDAPAY_WEBHOOK_RECEIVED", {
      event_type: eventType,
      transaction_id: transaction.id,
      status: transaction.status,
      amount: transaction.amount
    });

    // Traitement selon le type d'événement
    switch (eventType) {
      case 'transaction.approved':
        await handleTransactionApproved(transaction);
        break;
      
      case 'transaction.declined':
        await handleTransactionDeclined(transaction);
        break;
      
      case 'transaction.canceled':
        await handleTransactionCanceled(transaction);
        break;
      
      default:
        console.log(`ℹ️ Événement non traité: ${eventType}`);
    }

    res.status(200).json({ received: true });

  } catch (err) {
    console.error("❌ Erreur Webhook FedaPay:", err);
    res.status(500).json({ error: "Erreur traitement webhook" });
  }
};

// =======================================================
// 🧩 Gestion transaction approuvée
// =======================================================
async function handleTransactionApproved(transaction) {
  const metadata = transaction.metadata || {};
  
  try {
    // Vérifier doublon
    const { data: existing } = await supabase
      .from("payment_sessions")
      .select("id, status")
      .eq("provider_transaction_id", transaction.id)
      .single();

    if (existing && existing.status === 'approved') {
      console.log("✅ Transaction déjà traitée");
      return;
    }

    // Mise à jour session
    await supabase
      .from("payment_sessions")
      .update({ 
        status: "approved",
        approved_at: new Date().toISOString(),
        session_data: transaction
      })
      .eq("provider_transaction_id", transaction.id);

    // Traitement selon le type
    if (metadata.type === 'ORDER_PRODUCT') {
      await processOrderPayment(transaction, metadata);
    } else if (metadata.type === 'ESCROW_SERVICE') {
      await processEscrowPayment(transaction, metadata);
    }

    await logAction(metadata.buyer_id || metadata.client_id, "FEDAPAY_PAYMENT_APPROVED", {
      transaction_id: transaction.id,
      amount: transaction.amount,
      type: metadata.type
    });

  } catch (error) {
    console.error("❌ Erreur traitement transaction approuvée:", error);
    throw error;
  }
}

// Traitement commande produit
async function processOrderPayment(transaction, metadata) {
  // Distribuer fonds et commissions
  await fedapayService.distributeOrderFunds(
    metadata.order_id,
    transaction.id // internal_transaction_id
  );
}

// Traitement escrow mission
async function processEscrowPayment(transaction, metadata) {
  // Mettre à jour mission
  await supabase
    .from("freelance_missions")
    .update({ 
      status: "in_progress", 
      escrow_status: "held",
      escrow_transaction_id: transaction.id,
      escrow_held_at: new Date().toISOString()
    })
    .eq("id", metadata.mission_id);
}

// =======================================================
// 📊 Statut paiement (VRAI CODE)
// =======================================================
export const getPaymentStatus = async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Récupération session
    const { data: session, error } = await supabase
      .from("payment_sessions")
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', req.user.id)
      .single();

    if (error || !session) {
      return res.status(404).json({ error: "Session non trouvée" });
    }

    // 🎯 VÉRIFICATION RÉELLE STATUT FEDAPAY
    const statusResult = await fedapayService.getTransactionStatus(
      session.provider_transaction_id
    );

    if (!statusResult.success) {
      throw new Error(statusResult.error);
    }

    // Mise à jour statut local si différent
    if (statusResult.status !== session.status) {
      await supabase
        .from("payment_sessions")
        .update({ status: statusResult.status })
        .eq('id', sessionId);
    }

    res.json({
      success: true,
      data: {
        session: { ...session, status: statusResult.status },
        fedapay_status: statusResult.status,
        transaction: statusResult.transaction
      }
    });

  } catch (error) {
    console.error("❌ Erreur getPaymentStatus:", error);
    res.status(500).json({ 
      error: "Erreur récupération statut",
      code: "STATUS_CHECK_ERROR"
    });
  }
};

// =======================================================
// 💸 Remboursement (VRAI CODE)
// =======================================================
export const refundPayment = async (req, res) => {
  try {
    const { error, value } = Joi.object({
      transaction_id: Joi.string().uuid().required(),
      amount: Joi.number().min(1).required(),
      reason: Joi.string().max(500).required()
    }).validate(req.body);

    if (error) {
      return res.status(400).json({ 
        error: "Données invalides", 
        details: error.details[0].message 
      });
    }

    const { transaction_id, amount, reason } = value;

    // Récupération transaction
    const { data: transaction, error: txError } = await supabase
      .from("payment_sessions")
      .select('*')
      .eq('id', transaction_id)
      .single();

    if (txError || !transaction) {
      return res.status(404).json({ error: "Transaction non trouvée" });
    }

    if (transaction.status !== 'approved') {
      return res.status(400).json({ error: "Transaction non remboursable" });
    }

    // 🎯 REMBOURSEMENT RÉEL FEDAPAY
    const refundResult = await fedapayService.refundTransaction(
      transaction.provider_transaction_id,
      amount,
      reason
    );

    if (!refundResult.success) {
      throw new Error(refundResult.error);
    }

    // Mise à jour base de données
    const { data: updatedTx, error: updateError } = await supabase
      .from("payment_sessions")
      .update({
        status: 'refunded',
        refund_amount: amount,
        refund_reason: reason,
        refunded_at: new Date().toISOString(),
        session_data: {
          ...transaction.session_data,
          refund: refundResult.refund
        }
      })
      .eq('id', transaction_id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Mise à jour commande si applicable
    if (transaction.order_id) {
      await supabase
        .from("orders")
        .update({ 
          status: 'refunded',
          refund_amount: amount
        })
        .eq('id', transaction.order_id);
    }

    // Log admin
    await logAction(req.user.id, "FEDAPAY_REFUND_PROCESSED", {
      transaction_id,
      amount,
      reason,
      fedapay_refund_id: refundResult.refund_id,
      user_id: transaction.user_id
    });

    res.json({
      success: true,
      message: "Remboursement effectué avec succès",
      data: {
        session: updatedTx,
        refund: refundResult.refund
      }
    });

  } catch (error) {
    console.error("❌ Erreur refundPayment:", error);
    res.status(500).json({ 
      error: error.message || "Erreur lors du remboursement",
      code: "REFUND_ERROR"
    });
  }
};

// =======================================================
// 🎯 Déblocage escrow mission (pour le freelanceController)
// =======================================================
export const releaseEscrowFunds = async (missionId, freelancerId, finalPrice) => {
  try {
    // Récupérer la transaction escrow
    const { data: mission, error } = await supabase
      .from("freelance_missions")
      .select("escrow_transaction_id")
      .eq("id", missionId)
      .single();

    if (error || !mission) {
      throw new Error("Mission non trouvée");
    }

    // 🎯 DÉBLOCAGE RÉEL DES FONDS
    const commission = await fedapayService.releaseEscrowFunds(
      missionId,
      mission.escrow_transaction_id,
      freelancerId,
      finalPrice
    );

    return commission;

  } catch (error) {
    console.error("❌ Erreur releaseEscrowFunds:", error);
    throw error;
  }
};

// =======================================================
// 🔧 Fonctions utilitaires
// =======================================================

// Logging
async function logAction(userId, action, metadata = {}) {
  try {
    await supabase
      .from("admin_logs")
      .insert({
        user_id: userId,
        action: action,
        metadata: metadata
      });
  } catch (error) {
    console.error("❌ Erreur logging:", error);
  }
}

// Gestion autres statuts
async function handleTransactionDeclined(transaction) {
  await updatePaymentStatus(transaction.id, 'declined');
}

async function handleTransactionCanceled(transaction) {
  await updatePaymentStatus(transaction.id, 'canceled');
}

async function updatePaymentStatus(providerId, status) {
  await supabase
    .from("payment_sessions")
    .update({ status: status })
    .eq("provider_transaction_id", providerId);
}

export default {
  initFedapayPayment,
  initFedapayEscrowPayment,
  handleFedapayWebhook,
  getPaymentStatus,
  refundPayment,
  releaseEscrowFunds
};
