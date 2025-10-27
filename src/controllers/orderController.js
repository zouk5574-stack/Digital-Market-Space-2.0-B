import { supabase } from '../config/database.js';
import { notificationService } from '../services/notificationService.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { log } from '../utils/logger.js';

export const orderController = {
  // Création d'une commande après sélection d'un seller
  createOrder: asyncHandler(async (req, res) => {
    const { mission_id, seller_id, amount, description, deadline } = req.body;
    const buyerId = req.user.id;

    // Validation des données
    if (!mission_id || !seller_id || !amount) {
      throw new AppError('Mission ID, Seller ID et montant requis', 400);
    }

    if (amount < 100) {
      throw new AppError('Le montant minimum est de 100 FCFA', 400);
    }

    // Vérification de la mission
    const { data: mission, error: missionError } = await supabase
      .from('missions')
      .select('*')
      .eq('id', mission_id)
      .single();

    if (missionError || !mission) {
      throw new AppError('Mission non trouvée', 404);
    }

    // Vérification que le créateur est bien l'acheteur
    if (mission.user_id !== buyerId) {
      throw new AppError('Non autorisé à créer une commande pour cette mission', 403);
    }

    // Vérification que le mission est bien en statut "pending" ou "active"
    if (mission.status !== 'pending' && mission.status !== 'active') {
      throw new AppError('Cette mission n\'est pas disponible pour la commande', 400);
    }

    // Vérification du seller
    const { data: seller, error: sellerError } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, rating, response_rate')
      .eq('id', seller_id)
      .single();

    if (sellerError || !seller) {
      throw new AppError('Seller non trouvé', 404);
    }

    // Vérification que le seller a bien postulé à cette mission
    const { data: application, error: applicationError } = await supabase
      .from('mission_applications')
      .select('id')
      .eq('mission_id', mission_id)
      .eq('seller_id', seller_id)
      .eq('status', 'pending')
      .single();

    if (applicationError || !application) {
      throw new AppError('Ce seller n\'a pas postulé à cette mission ou a déjà été sélectionné', 400);
    }

    // Vérification qu'il n'y a pas déjà une commande active pour cette mission
    const { data: existingOrder, error: existingOrderError } = await supabase
      .from('orders')
      .select('id')
      .eq('mission_id', mission_id)
      .in('status', ['pending', 'awaiting_payment', 'paid', 'in_progress'])
      .single();

    if (existingOrder && !existingOrderError) {
      throw new AppError('Une commande est déjà en cours pour cette mission', 409);
    }

    // Création de la commande
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        mission_id: mission_id,
        buyer_id: buyerId,
        seller_id: seller_id,
        amount: amount,
        description: description || `Commande pour la mission: ${mission.title}`,
        status: 'pending',
        deadline: deadline || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select(`
        *,
        mission:missions(*),
        buyer:users(id, first_name, last_name, email),
        seller:users(id, first_name, last_name, email, rating)
      `)
      .single();

    if (orderError) {
      log.error('Erreur création commande:', orderError);
      throw new AppError('Erreur lors de la création de la commande', 500);
    }

    // Mise à jour du statut de la mission
    await supabase
      .from('missions')
      .update({
        status: 'assigned',
        assigned_seller_id: seller_id,
        updated_at: new Date().toISOString()
      })
      .eq('id', mission_id);

    // Mise à jour du statut de la candidature
    await supabase
      .from('mission_applications')
      .update({
        status: 'accepted',
        updated_at: new Date().toISOString()
      })
      .eq('mission_id', mission_id)
      .eq('seller_id', seller_id);

    // Rejet des autres candidatures
    await supabase
      .from('mission_applications')
      .update({
        status: 'rejected',
        updated_at: new Date().toISOString()
      })
      .eq('mission_id', mission_id)
      .neq('seller_id', seller_id);

    // Notification au seller
    await notificationService.sendMissionAssignedNotification(seller_id, {
      mission_id: mission_id,
      order_id: order.id,
      title: mission.title,
      budget: amount
    });

    log.info('Commande créée avec succès - En attente de paiement', {
      orderId: order.id,
      missionId: mission_id,
      buyerId: buyerId,
      sellerId: seller_id,
      amount: amount
    });

    res.status(201).json({
      success: true,
      message: 'Commande créée avec succès. Veuillez procéder au paiement pour démarrer la mission.',
      data: {
        order: order,
        next_step: 'payment_required'
      }
    });
  }),

  // Acceptation d'une commande par le seller (après paiement)
  confirmOrderStart: asyncHandler(async (req, res) => {
    const { order_id } = req.params;
    const sellerId = req.user.id;

    // Vérification de la commande
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', order_id)
      .single();

    if (orderError || !order) {
      throw new AppError('Commande non trouvée', 404);
    }

    // Vérification que l'utilisateur est bien le seller assigné
    if (order.seller_id !== sellerId) {
      throw new AppError('Non autorisé à confirmer cette commande', 403);
    }

    // Vérification du statut - doit être "paid" pour démarrer
    if (order.status !== 'paid') {
      throw new AppError('Le paiement doit être effectué avant de démarrer la mission', 400);
    }

    // Mise à jour de la commande
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'in_progress',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', order_id)
      .select(`
        *,
        mission:missions(*),
        buyer:users(id, first_name, last_name, email),
        seller:users(id, first_name, last_name, email)
      `)
      .single();

    if (updateError) {
      log.error('Erreur confirmation démarrage commande:', updateError);
      throw new AppError('Erreur lors de la confirmation du démarrage', 500);
    }

    // Notification à l'acheteur
    await notificationService.sendSystemNotification(
      order.buyer_id,
      'Mission Démarrée',
      `Le seller a démarré votre mission "${order.mission?.title}".`,
      {
        order_id: order_id,
        mission_id: order.mission_id,
        seller_name: `${updatedOrder.seller.first_name} ${updatedOrder.seller.last_name}`
      }
    );

    log.info('Mission démarrée par le seller', {
      orderId: order_id,
      sellerId: sellerId
    });

    res.json({
      success: true,
      message: 'Mission démarrée avec succès',
      data: {
        order: updatedOrder
      }
    });
  }),

  // Soumission de livrable par le seller
  submitDelivery: asyncHandler(async (req, res) => {
    const { order_id } = req.params;
    const sellerId = req.user.id;
    const { delivery_files, delivery_notes } = req.body;

    // Vérification de la commande
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', order_id)
      .single();

    if (orderError || !order) {
      throw new AppError('Commande non trouvée', 404);
    }

    // Vérification que l'utilisateur est bien le seller assigné
    if (order.seller_id !== sellerId) {
      throw new AppError('Non autorisé à soumettre un livrable pour cette commande', 403);
    }

    // Vérification du statut - doit être "in_progress"
    if (order.status !== 'in_progress') {
      throw new AppError('Cette commande ne peut pas recevoir de livrable', 400);
    }

    // Mise à jour de la commande avec le livrable
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'awaiting_review',
        delivery_files: delivery_files || [],
        delivery_notes: delivery_notes || '',
        delivered_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', order_id)
      .select()
      .single();

    if (updateError) {
      log.error('Erreur soumission livrable:', updateError);
      throw new AppError('Erreur lors de la soumission du livrable', 500);
    }

    // Notification à l'acheteur
    await notificationService.sendSystemNotification(
      order.buyer_id,
      'Livrable Soumis',
      `Le seller a soumis un livrable pour votre mission "${order.mission?.title}". Veuillez le réviser.`,
      {
        order_id: order_id,
        mission_id: order.mission_id,
        seller_name: `${order.seller?.first_name} ${order.seller?.last_name}`
      }
    );

    log.info('Livrable soumis par le seller', {
      orderId: order_id,
      sellerId: sellerId
    });

    res.json({
      success: true,
      message: 'Livrable soumis avec succès. En attente de révision.',
      data: {
        order: updatedOrder
      }
    });
  }),

  // Approbation du livrable par l'acheteur
  approveDelivery: asyncHandler(async (req, res) => {
    const { order_id } = req.params;
    const buyerId = req.user.id;

    // Vérification de la commande
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', order_id)
      .single();

    if (orderError || !order) {
      throw new AppError('Commande non trouvée', 404);
    }

    // Vérification que l'utilisateur est bien l'acheteur
    if (order.buyer_id !== buyerId) {
      throw new AppError('Non autorisé à approuver ce livrable', 403);
    }

    // Vérification du statut - doit être "awaiting_review"
    if (order.status !== 'awaiting_review') {
      throw new AppError('Cette commande n\'est pas en attente de révision', 400);
    }

    // Début de la transaction
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', order_id)
      .select()
      .single();

    if (updateError) {
      log.error('Erreur approbation livrable:', updateError);
      throw new AppError('Erreur lors de l\'approbation du livrable', 500);
    }

    // Libération des fonds au seller
    const { error: walletError } = await supabase
      .from('wallet_transactions')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('order_id', order_id)
      .eq('type', 'credit');

    if (walletError) {
      log.error('Erreur libération fonds:', walletError);
      // On continue car la commande est marquée comme complète
    }

    // Mise à jour des statistiques utilisateur
    await supabase
      .from('users')
      .update({
        completed_orders: supabase.raw('completed_orders + 1'),
        balance: supabase.raw(`balance + ${order.amount}`),
        updated_at: new Date().toISOString()
      })
      .eq('id', order.seller_id);

    // Mise à jour de la mission
    await supabase
      .from('missions')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', order.mission_id);

    // Notification au seller
    await notificationService.sendOrderCompletedNotification(order.seller_id, {
      order_id: order_id,
      mission_id: order.mission_id,
      amount: order.amount
    });

    log.info('Livrable approuvé - Commande terminée', {
      orderId: order_id,
      buyerId: buyerId,
      sellerId: order.seller_id,
      amount: order.amount
    });

    res.json({
      success: true,
      message: 'Livrable approuvé et commande terminée avec succès',
      data: {
        order: updatedOrder,
        funds_released: true
      }
    });
  }),

  // Demande de révision par l'acheteur
  requestRevision: asyncHandler(async (req, res) => {
    const { order_id } = req.params;
    const buyerId = req.user.id;
    const { revision_notes } = req.body;

    if (!revision_notes) {
      throw new AppError('Notes de révision requises', 400);
    }

    // Vérification de la commande
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', order_id)
      .single();

    if (orderError || !order) {
      throw new AppError('Commande non trouvée', 404);
    }

    if (order.buyer_id !== buyerId) {
      throw new AppError('Non autorisé à demander une révision', 403);
    }

    if (order.status !== 'awaiting_review') {
      throw new AppError('Cette commande ne peut pas recevoir de demande de révision', 400);
    }

    // Mise à jour de la commande
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'revision_requested',
        revision_notes: revision_notes,
        revision_requested_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', order_id)
      .select()
      .single();

    if (updateError) {
      log.error('Erreur demande révision:', updateError);
      throw new AppError('Erreur lors de la demande de révision', 500);
    }

    // Notification au seller
    await notificationService.sendSystemNotification(
      order.seller_id,
      'Révision Demandée',
      `L'acheteur a demandé une révision pour la mission "${order.mission?.title}".`,
      {
        order_id: order_id,
        mission_id: order.mission_id,
        revision_notes: revision_notes
      }
    );

    log.info('Révision demandée par l\'acheteur', {
      orderId: order_id,
      buyerId: buyerId
    });

    res.json({
      success: true,
      message: 'Demande de révision envoyée avec succès',
      data: {
        order: updatedOrder
      }
    });
  }),

  // Récupération des commandes utilisateur
  getUserOrders: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { page = 1, limit = 10, status, role = 'all' } = req.query;

    const offset = (page - 1) * limit;

    let query = supabase
      .from('orders')
      .select(`
        *,
        mission:missions(*),
        buyer:users(id, first_name, last_name, username, rating),
        seller:users(id, first_name, last_name, username, rating)
      `, { count: 'exact' })
      .order('created_at', { ascending: false });

    // Filtrage par rôle
    if (role === 'buyer') {
      query = query.eq('buyer_id', userId);
    } else if (role === 'seller') {
      query = query.eq('seller_id', userId);
    } else {
      // Toutes les commandes où l'utilisateur est impliqué
      query = query.or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);
    }

    if (status) {
      query = query.eq('status', status);
    }

    query = query.range(offset, offset + limit - 1);

    const { data: orders, error, count } = await query;

    if (error) {
      log.error('Erreur récupération commandes:', error);
      throw new AppError('Erreur lors de la récupération des commandes', 500);
    }

    res.json({
      success: true,
      data: {
        orders: orders || [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit)
        }
      }
    });
  }),

  // Détails d'une commande spécifique
  getOrderDetails: asyncHandler(async (req, res) => {
    const { order_id } = req.params;
    const userId = req.user.id;

    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        *,
        mission:missions(*),
        buyer:users(id, first_name, last_name, username, rating, email),
        seller:users(id, first_name, last_name, username, rating, email),
        payments(id, amount, status, created_at)
      `)
      .eq('id', order_id)
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
      .single();

    if (error || !order) {
      throw new AppError('Commande non trouvée', 404);
    }

    res.json({
      success: true,
      data: {
        order: order
      }
    });
  })
};