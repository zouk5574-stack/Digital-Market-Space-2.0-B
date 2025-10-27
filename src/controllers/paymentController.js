import { fedapayService } from '../services/fedapayService.js';
import { supabase } from '../config/database.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { log } from '../utils/logger.js';

export const paymentController = {
  // Initialisation d'un paiement
  initializePayment: asyncHandler(async (req, res) => {
    const { order_id, amount, payment_method, metadata = {} } = req.body;
    const userId = req.user.id;

    // Validation des données
    if (!order_id || !amount) {
      throw new AppError('Order ID et montant requis', 400);
    }

    if (amount < 100) {
      throw new AppError('Le montant minimum est de 100 FCFA', 400);
    }

    // Vérification de la commande
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        mission:missions(*),
        buyer:users(id, email, first_name, last_name, phone),
        freelancer:users(id, email, first_name, last_name, phone)
      `)
      .eq('id', order_id)
      .single();

    if (orderError || !order) {
      throw new AppError('Commande non trouvée', 404);
    }

    // Vérification des permissions
    if (order.buyer_id !== userId && order.freelancer_id !== userId) {
      throw new AppError('Non autorisé à payer cette commande', 403);
    }

    // Vérification du statut de la commande
    if (order.status !== 'pending' && order.status !== 'awaiting_payment') {
      throw new AppError('Cette commande ne peut pas être payée', 400);
    }

    // Données client pour FedaPay
    const customer = {
      email: req.user.email,
      first_name: req.user.first_name,
      last_name: req.user.last_name,
      phone: req.user.phone || ''
    };

    // Métadonnées de paiement
    const paymentMetadata = {
      ...metadata,
      order_id: order_id,
      user_id: userId,
      mission_id: order.mission_id,
      platform: 'digital-market-space'
    };

    // Initialisation du paiement
    const paymentResult = await fedapayService.initializePayment({
      amount: amount,
      description: `Paiement pour la mission: ${order.mission?.title || 'Mission'}`,
      customer: customer,
      callback_url: `${process.env.BACKEND_URL}/api/payments/webhook`,
      metadata: paymentMetadata
    });

    // Enregistrement de la transaction en base
    const { data: transaction, error: transactionError } = await supabase
      .from('payments')
      .insert({
        order_id: order_id,
        user_id: userId,
        amount: amount,
        currency: 'XOF',
        payment_method: payment_method || 'mobile_money',
        status: 'pending',
        transaction_id: paymentResult.transaction_id,
        reference: paymentResult.reference,
        payment_url: paymentResult.payment_url,
        qr_code: paymentResult.qr_code,
        metadata: paymentMetadata,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (transactionError) {
      log.error('Erreur enregistrement transaction:', transactionError);
      throw new AppError('Erreur lors de l\'enregistrement de la transaction', 500);
    }

    // Mise à jour du statut de la commande
    await supabase
      .from('orders')
      .update({
        status: 'awaiting_payment',
        updated_at: new Date().toISOString()
      })
      .eq('id', order_id);

    log.info('Paiement initialisé avec succès', {
      paymentId: transaction.id,
      orderId: order_id,
      userId: userId,
      amount: amount
    });

    res.status(201).json({
      success: true,
      message: 'Paiement initialisé avec succès',
      data: {
        payment: transaction,
        payment_details: {
          payment_url: paymentResult.payment_url,
          qr_code: paymentResult.qr_code,
          reference: paymentResult.reference
        }
      }
    });
  }),

  // Vérification du statut d'un paiement
  verifyPayment: asyncHandler(async (req, res) => {
    const { payment_id } = req.params;
    const userId = req.user.id;

    // Récupération du paiement
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('*')
      .eq('id', payment_id)
      .single();

    if (paymentError || !payment) {
      throw new AppError('Paiement non trouvé', 404);
    }

    // Vérification des permissions
    if (payment.user_id !== userId) {
      throw new AppError('Non autorisé à vérifier ce paiement', 403);
    }

    // Vérification avec FedaPay
    const verification = await fedapayService.verifyTransaction(
      payment.transaction_id
    );

    // Mise à jour du statut en base
    const { data: updatedPayment, error: updateError } = await supabase
      .from('payments')
      .update({
        status: verification.status,
        updated_at: new Date().toISOString(),
        ...(verification.paid_at && { paid_at: verification.paid_at })
      })
      .eq('id', payment_id)
      .select()
      .single();

    if (updateError) {
      log.error('Erreur mise à jour statut paiement:', updateError);
    }

    // Si le paiement est réussi, mise à jour de la commande
    if (verification.status === 'approved') {
      await this.handleSuccessfulPayment(payment);
    }

    log.info('Paiement vérifié', {
      paymentId: payment_id,
      status: verification.status,
      userId: userId
    });

    res.json({
      success: true,
      data: {
        payment: updatedPayment || payment,
        verification: verification
      }
    });
  }),

  // Gestion d'un paiement réussi
  async handleSuccessfulPayment(payment) {
    try {
      // Mise à jour de la commande
      const { error: orderError } = await supabase
        .from('orders')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', payment.order_id);

      if (orderError) {
        log.error('Erreur mise à jour commande après paiement:', orderError);
        return;
      }

      // Créditation du wallet du freelancer (mise en attente)
      const { data: order } = await supabase
        .from('orders')
        .select('freelancer_id, amount')
        .eq('id', payment.order_id)
        .single();

      if (order && order.freelancer_id) {
        await supabase
          .from('wallet_transactions')
          .insert({
            user_id: order.freelancer_id,
            order_id: payment.order_id,
            type: 'credit',
            amount: order.amount,
            status: 'pending',
            description: `Paiement pour commande #${payment.order_id}`,
            created_at: new Date().toISOString()
          });
      }

      log.info('Paiement réussi traité', {
        paymentId: payment.id,
        orderId: payment.order_id,
        amount: payment.amount
      });
