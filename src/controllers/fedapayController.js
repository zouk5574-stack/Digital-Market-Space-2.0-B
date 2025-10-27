import crypto from "crypto";
import { supabase } from "../config/supabase.js";
import Joi from "joi";

// ===============================
// ⚙️ Configuration & Validation
// ===============================
const FEDAPAY_WEBHOOK_SECRET = process.env.FEDAPAY_WEBHOOK_SECRET;

const fedapayValidation = {
  initPayment: Joi.object({
    amount: Joi.number().min(100).required(),
    description: Joi.string().max(255).required(),
    order_id: Joi.string().uuid().required(),
    buyer_id: Joi.string().uuid().required(),
    currency: Joi.string().valid('XOF', 'EUR', 'USD').default('XOF')
  }),
  webhook: Joi.object({
    event: Joi.string().required(),
    data: Joi.object({
      id: Joi.string().required(),
      status: Joi.string().required(),
      amount: Joi.number().required(),
      currency: Joi.string().required(),
      metadata: Joi.object({
        type: Joi.string().valid('ORDER_PRODUCT', 'ESCROW_SERVICE').required(),
        order_id: Joi.string().uuid().optional(),
        mission_id: Joi.string().uuid().optional(),
        buyer_id: Joi.string().uuid().required()
      }).required()
    }).required()
  })
};

// =======================================================
// 🟢 Initialisation du paiement (Version améliorée)
// =======================================================
export const initFedapayPayment = async (req, res) => {
  try {
    const { error, value } = fedapayValidation.initPayment.validate(req.body);
    if (error) {
      return res.status(400).json({ 
        error: "Données invalides", 
        details: error.details[0].message 
      });
    }

    const { amount, description, order_id, buyer_id, currency } = value;

    // Vérifier que l'utilisateur est bien le buyer
    if (req.user.id !== buyer_id) {
      return res.status(403).json({ error: "Accès non autorisé" });
    }

    // Vérifier que la commande existe et appartient au buyer
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, status, total_amount, user_id")
      .eq("id", order_id)
      .eq("user_id", buyer_id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: "Commande non trouvée" });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({ error: "Commande déjà traitée" });
    }

    // 🔑 Récupération configuration Fedapay
    const { data: config, error: cfgError } = await supabase
      .from("payment_providers")
      .select("api_key, environment, is_active")
      .eq("name", "fedapay")
      .eq("is_active", true)
      .single();

    if (cfgError || !config) {
      return res.status(503).json({ 
        error: "Service de paiement temporairement indisponible" 
      });
    }

    // 💰 Création du lien de paiement (simulation - à remplacer par le vrai service)
    const paymentData = await createFedapayPaymentLink(
      config.api_key,
      config.environment,
      amount,
      description,
      order_id,
      buyer_id,
      currency
    );

    // 💾 Enregistrement de la session de paiement
    const { data: session, error: sessionError } = await supabase
      .from("payment_sessions")
      .insert({
        user_id: buyer_id,
        order_id: order_id,
        amount: amount,
        currency: currency,
        provider: "fedapay",
        provider_session_id: paymentData.id,
        session_data: paymentData,
        status: "pending",
        expires_at: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
      })
      .select()
      .single();

    if (sessionError) throw sessionError;

    // 🔄 Mettre à jour le statut de la commande
    await supabase
      .from("orders")
      .update({ status: "payment_pending" })
      .eq("id", order_id);

    // 📝 Log de l'action
    await logAction(buyer_id, "FEDAPAY_PAYMENT_INITIATED", {
      order_id,
      amount,
      currency,
      session_id: session.id,
      provider_session_id: paymentData.id
    });

    res.status(200).json({ 
      success: true,
      data: {
        payment_url: paymentData.payment_url,
        session_id: session.id,
        expires_at: session.expires_at
      }
    });

  } catch (err) {
    console.error("❌ Erreur initFedapayPayment:", err);
    res.status(500).json({ 
      error: "Erreur lors de l'initialisation du paiement",
      code: "PAYMENT_INIT_ERROR"
    });
  }
};

// =======================================================
// 🔵 Webhook Fedapay (Version sécurisée améliorée)
// =======================================================
export const handleFedapayWebhook = async (req, res) => {
  try {
    const rawBody = req.rawBody;
    const signature = req.headers["x-fedapay-signature"];

    if (!rawBody || !signature) {
      console.warn("🚨 Webhook FedaPay: Body ou signature manquant");
      return res.status(400).json({ error: "Données webhook incomplètes" });
    }

    // ✅ Vérification sécurisée de la signature HMAC
    const isValid = verifyWebhookSignature(rawBody, signature);
    
    if (!isValid) {
      console.warn("🚨 Signature FedaPay invalide !");
      await logAction(null, "FEDAPAY_WEBHOOK_SIGNATURE_INVALID", {
        ip: req.ip,
        user_agent: req.get('User-Agent')
      });
      return res.status(401).json({ error: "Signature invalide" });
    }

    const event = JSON.parse(rawBody);
    
    // Validation du format de l'événement
    const { error } = fedapayValidation.webhook.validate(event);
    if (error) {
      console.warn("⚠️ Format d'événement FedaPay invalide:", error.details[0].message);
      return res.status(400).json({ error: "Format d'événement invalide" });
    }

    const { data, type: eventType } = event;
    const metadata = data.metadata || {};

    await logAction(metadata.buyer_id, "FEDAPAY_WEBHOOK_RECEIVED", {
      event_type: eventType,
      transaction_id: data.id,
      metadata_type: metadata.type,
      status: data.status
    });

    // ==============================
    // 🎯 ROUTAGE DES ÉVÉNEMENTS
    // ==============================
    switch (eventType) {
      case 'transaction.approved':
        await handleTransactionApproved(data, metadata);
        break;
      
      case 'transaction.declined':
        await handleTransactionDeclined(data, metadata);
        break;
      
      case 'transaction.canceled':
        await handleTransactionCanceled(data, metadata);
        break;
      
      case 'transaction.refunded':
        await handleTransactionRefunded(data, metadata);
        break;
      
      default:
        console.log(`ℹ️ Événement FedaPay non traité: ${eventType}`);
    }

    res.status(200).json({ received: true });

  } catch (err) {
    console.error("❌ Erreur Webhook FedaPay:", err);
    await logAction(null, "FEDAPAY_WEBHOOK_ERROR", {
      error: err.message,
      stack: err.stack
    });
    res.status(500).json({ error: "Erreur interne de traitement webhook" });
  }
};

// =======================================================
// 🎯 Gestion des transactions approuvées
// =======================================================
async function handleTransactionApproved(data, metadata) {
  const { id: provider_transaction_id, status, amount, currency } = data;
  const { type, order_id, mission_id, buyer_id } = metadata;

  try {
    // Vérifier si la transaction existe déjà
    const { data: existing } = await supabase
      .from("transactions")
      .select("id, status")
      .eq("provider_reference", provider_transaction_id)
      .single();

    if (existing) {
      if (existing.status === 'success') {
        console.log("✅ Transaction déjà traitée avec succès");
        return;
      }
      // Mettre à jour si statut différent
      await supabase
        .from("transactions")
        .update({ status: "success" })
        .eq("id", existing.id);
    } else {
      // Créer nouvelle transaction
      const { data: tx, error: txError } = await supabase
        .from("transactions")
        .insert([
          {
            provider: "fedapay",
            provider_reference: provider_transaction_id,
            type: type === 'ESCROW_SERVICE' ? 'escrow' : 'order',
            amount,
            currency,
            buyer_id,
            status: "success",
            metadata: metadata
          },
        ])
        .select()
        .single();

      if (txError) throw txError;
    }

    // Traitement selon le type
    if (type === 'ORDER_PRODUCT') {
      await processOrderPayment(provider_transaction_id, order_id, buyer_id, amount);
    } else if (type === 'ESCROW_SERVICE') {
      await processEscrowPayment(provider_transaction_id, mission_id, buyer_id, amount);
    }

    await logAction(buyer_id, "FEDAPAY_PAYMENT_APPROVED", {
      transaction_id: provider_transaction_id,
      amount,
      currency,
      type: type
    });

  } catch (error) {
    console.error("❌ Erreur traitement transaction approuvée:", error);
    await logAction(buyer_id, "FEDAPAY_PAYMENT_PROCESSING_ERROR", {
      transaction_id: provider_transaction_id,
      error: error.message
    });
    throw error;
  }
}

// =======================================================
// 🧩 Processus paiement commande produit
// =======================================================
async function processOrderPayment(transactionId, orderId, buyerId, amount) {
  // Mettre à jour la session de paiement
  const { error: sessionError } = await supabase
    .from("payment_sessions")
    .update({ 
      status: "completed",
      completed_at: new Date().toISOString()
    })
    .eq("provider_session_id", transactionId);

  if (sessionError) throw sessionError;

  // Mettre à jour la commande
  const { error: orderError } = await supabase
    .from("orders")
    .update({ 
      status: "paid",
      payment_status: "completed",
      paid_at: new Date().toISOString()
    })
    .eq("id", orderId);

  if (orderError) throw orderError;

  // Distribuer les fonds aux vendeurs et calculer les commissions
  await distributeOrderFunds(orderId, amount);

  await logAction(buyerId, "ORDER_PAYMENT_COMPLETED", {
    order_id: orderId,
    amount,
    transaction_id: transactionId
  });
}

// =======================================================
// 🧩 Processus escrow missions freelance
// =======================================================
async function processEscrowPayment(transactionId, missionId, buyerId, amount) {
  // Mettre à jour la mission
  const { error: missionError } = await supabase
    .from("freelance_missions")
    .update({ 
      status: "in_progress",
      escrow_status: "held",
      escrow_transaction_id: transactionId
    })
    .eq("id", missionId);

  if (missionError) throw missionError;

  await logAction(buyerId, "ESCROW_PAYMENT_HELD", {
    mission_id: missionId,
    amount,
    transaction_id: transactionId
  });
}

// =======================================================
// 🔧 Fonctions utilitaires
// =======================================================

// Vérification signature webhook
function verifyWebhookSignature(payload, signature) {
  if (!FEDAPAY_WEBHOOK_SECRET) {
    console.warn("⚠️ FEDAPAY_WEBHOOK_SECRET non configuré - acceptation sans vérification");
    return true; // En développement
  }

  try {
    const computedSignature = crypto
      .createHmac("sha256", FEDAPAY_WEBHOOK_SECRET)
      .update(payload)
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(signature, "utf8"),
      Buffer.from(computedSignature, "utf8")
    );
  } catch (error) {
    console.error("❌ Erreur vérification signature:", error);
    return false;
  }
}

// Simulation création lien FedaPay
async function createFedapayPaymentLink(apiKey, environment, amount, description, orderId, buyerId, currency) {
  // À remplacer par l'intégration réelle FedaPay
  return {
    id: `fp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    amount,
    currency,
    description,
    payment_url: `https://sandbox.fedapay.com/pay/${Date.now()}`,
    created_at: new Date().toISOString(),
    metadata: {
      order_id: orderId,
      buyer_id: buyerId,
      type: 'ORDER_PRODUCT'
    }
  };
}

// Distribution des fonds commande
async function distributeOrderFunds(orderId, totalAmount) {
  try {
    // Récupérer les items de la commande
    const { data: orderItems, error } = await supabase
      .from("order_items")
      .select(`
        quantity, 
        price,
        product:products(
          shop:shops(
            user_id,
            commission_rate
          )
        )
      `)
      .eq("order_id", orderId);

    if (error) throw error;

    // Calculer les commissions et distribuer
    for (const item of orderItems) {
      const shop = item.product.shop;
      const itemTotal = item.quantity * item.price;
      const commissionRate = shop.commission_rate || 0.10;
      const commissionAmount = itemTotal * commissionRate;
      const sellerAmount = itemTotal - commissionAmount;

      // Enregistrer commission
      await supabase
        .from("commissions")
        .insert({
          order_id: orderId,
          shop_id: shop.id,
          seller_id: shop.user_id,
          amount: commissionAmount,
          seller_amount: sellerAmount,
          rate: commissionRate,
          status: "pending"
        });

      // Mettre à jour le portefeuille du vendeur
      await supabase
        .from("wallets")
        .update({ 
          pending_balance: supabase.raw('pending_balance + ??', [sellerAmount])
        })
        .eq("user_id", shop.user_id);
    }

  } catch (error) {
    console.error("❌ Erreur distribution fonds:", error);
    throw error;
  }
}

// Logging des actions
async function logAction(userId, action, metadata = {}) {
  try {
    await supabase
      .from("admin_logs")
      .insert({
        user_id: userId,
        action: action,
        metadata: metadata,
        ip_address: metadata.ip || null,
        user_agent: metadata.user_agent || null
      });
  } catch (error) {
    console.error("❌ Erreur logging:", error);
  }
}

// Gestion des autres événements
async function handleTransactionDeclined(data, metadata) {
  await updatePaymentStatus(data.id, 'failed', 'declined');
  await logAction(metadata.buyer_id, "FEDAPAY_PAYMENT_DECLINED", {
    transaction_id: data.id,
    reason: 'declined_by_provider'
  });
}

async function handleTransactionCanceled(data, metadata) {
  await updatePaymentStatus(data.id, 'canceled', 'user_canceled');
  await logAction(metadata.buyer_id, "FEDAPAY_PAYMENT_CANCELED", {
    transaction_id: data.id
  });
}

async function handleTransactionRefunded(data, metadata) {
  await updatePaymentStatus(data.id, 'refunded', 'full_refund');
  await logAction(metadata.buyer_id, "FEDAPAY_PAYMENT_REFUNDED", {
    transaction_id: data.id,
    amount: data.amount
  });
}

async function updatePaymentStatus(providerId, status, reason = null) {
  await supabase
    .from("payment_sessions")
    .update({ 
      status: status,
      failure_reason: reason
    })
    .eq("provider_session_id", providerId);
}

export default {
  initFedapayPayment,
  handleFedapayWebhook
};
