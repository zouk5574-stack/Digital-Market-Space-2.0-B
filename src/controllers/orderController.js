import { supabase } from '../config/database.js';
import { notificationService } from '../services/notificationService.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { log } from '../utils/logger.js';

export const orderController = {
  // Création d'une commande
  createOrder: asyncHandler(async (req, res) => {
    const { mission_id, freelancer_id, amount, description, deadline } = req.body;
    const buyerId = req.user.id;

    // Validation des données
    if (!mission_id || !freelancer_id || !amount) {
      throw new AppError('Mission ID, Freelancer ID et montant requis', 400);
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

    // Vérification du freelancer
    const { data: freelancer, error: freelancerError } = await supabase
      .from('users')
      .select('id, first_name, last_name, email')
      .eq('id', freelancer_id)
      .single();

    if (freelancerError || !freelancer) {
      throw new AppError('Freelancer non trouvé', 404);
    }

    // Vérification qu'il n'y a pas déjà une commande active pour cette mission
    const { data: existingOrder, error: existingOrderError } = await supabase
      .from('orders')
      .select('id')
      .eq('mission_id', mission_id)
      .in('status', ['pending', 'in_progress', 'awaiting_payment'])
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
        freelancer_id: freelancer_id,
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
        freelancer:users(id, first_name, last_name, email)
      `)
      .single();

    if (orderError) {
      log.error('Erreur création commande:', orderError);
      throw new AppError('Erreur lors de la création de la commande', 500);
    }

    // Notification au freelancer
    await notificationService.sendMissionAssignedNotification(freelancer_id, {
      mission_id: mission_id,
      order_id: order.id,
      title: mission.title,
      budget: amount
    });

    log.info('Commande créée avec succès', {
      orderId: order.id,
      missionId: mission_id,
      buyerId: buyerId,
      freelancerId: freelancer_id,
      amount: amount
    });

    res.status(201).json({
      success: true,
      message: 'Commande créée avec succès',
      data: {
        order: order
      }
    });
  }),

  // Acceptation d'une commande par le freelancer
  acceptOrder: asyncHandler(async (req, res) => {
    const { order_id } = req.params;
    const freelancerId = req.user.id;

    // Vérification de la commande
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', order_id)
      .single();

    if (orderError || !order) {
      throw new AppError('Commande non trouvée', 404);
    }

    // Vérification que l'utilisateur est bien le freelancer assigné
    if (order.freelancer_id !== freelancerId) {
      throw new AppError('Non autorisé à accepter cette commande', 403);
    }

    // Vérification du statut
    if (order.status !== 'pending') {
      throw new AppError('Cette commande ne peut pas être acceptée', 400);
    }

    // Mise à jour de la commande
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'awaiting_payment',
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', order_id)
      .select(`
        *,
        mission:missions(*),
        buyer:users(id, first_name, last_name, email),
        freelancer:users(id, first_name, last_name, email)
      `)
      .single();

    if (updateError) {
      log.error('Erreur acceptation commande:', updateError);
      throw new AppError('Erreur lors de l\'acceptation de la commande', 500);
    }

    // Notification à l'acheteur
    await notificationService.sendSystemNotification(
      order.buyer_id,
      'Commande Acceptée',
      `Le freelancer a accepté votre commande pour "${order.mission?.title}". Vous pouvez maintenant procéder au paiement.`,
      {
        order_id: order_id,
        mission_id: order.mission_id,
        freelancer_name: `${order.freelancer.first_name} ${order.freelancer.last_name}`
      }
    );

    log.info('Commande acceptée', {
      orderId: order_id,
      freelancerId: freelancerId
    });

    res.json({
      success: true,
      message: 'Commande acceptée avec succès',
      data: {
        order: updatedOrder
      }
    });
  }),

  // Refus d'une commande par le freelancer
  rejectOrder: asyncHandler(async (req, res) => {
    const { order_id } = req.params;
    const freelancerId = req.user.id;

    // Vérification de la commande
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', order_id)
      .single();

    if (orderError || !order) {
      throw new AppError('Commande non trouvée', 404);
    }

    if (order.freelancer_id !== freelancerId) {
      throw new AppError('Non autorisé à refuser cette commande', 403);
    }

    if (order.status !== 'pending') {
      throw new AppError('Cette commande ne peut pas être refusée', 400);
    }

    // Mise à jour de la commande
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'rejected',
        rejected_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', order_id)
      .select()
      .single();

    if (updateError) {
      log.error('Erreur refus commande:', updateError);
      throw new AppError('Erreur lors du refus de la commande', 500);
    }

    // Notification à l'acheteur
    await notificationService.sendSystemNotification(
      order.buyer_id,
      'Commande Refusée',
      `Le freelancer a refusé votre commande pour "${order.mission?.title}".`,
      {
        order_id: order_id,
        mission_id: order.mission_id
      }
    );

    log.info('Commande refusée', {
      orderId: order_id,
      freelancerId: freelancerId
    });

    res.json({
      success: true,
      message: 'Commande refusée avec succès',
      data: {
        order: updatedOrder
      }
    });
  }),

  // Marquer une commande comme terminée
  completeOrder: asyncHandler(async (req, res) => {
    const { order_id } = req.params;
    const userId = req.user.id;

    // Vérification de la commande
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', order_id)
      .single();

    if (orderError || !order) {
      throw new AppError('Commande non trouvée', 404);
    }

    // Vérification des permissions (seul le freelancer peut marquer comme terminé)
    if (order.freelancer_id !== userId) {
      throw new AppError('Non autorisé à terminer cette commande', 403);
    }

    // Vérification du statut
    if (order.status !== 'in_progress') {
      throw new AppError('Cette commande ne peut pas être marquée comme terminée', 400);
    }

    // Mise à jour de la commande
    const { data: updatedOrder, error: updateError } = await supabase
      .from('orders')
      .update({
        status: