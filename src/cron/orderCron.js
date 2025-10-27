const cron = require('node-cron');
const database = require('../config/database');
const logger = require('../utils/logger');
const constants = require('../utils/constants');
const notificationService = require('../services/notificationService');

class OrderCron {
  constructor() {
    this.init();
  }

  init() {
    // Vérifier les commandes toutes les 15 minutes
    cron.schedule(constants.CRON_SCHEDULES.CHECK_ORDERS, async () => {
      await this.checkOverdueOrders();
      await this.checkPendingOrders();
    });

    logger.info('✅ Cron de vérification des commandes configuré');
  }

  async checkOverdueOrders() {
    const jobId = `check_overdue_orders_${Date.now()}`;
    
    try {
      logger.info(`⏰ Vérification des commandes en retard: ${jobId}`);

      const overdueDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 jours

      const { data: overdueOrders, error } = await database.client
        .from('orders')
        .select(`
          *,
          mission:missions(title, deadline),
          buyer:users(first_name, last_name),
          seller:users(first_name, last_name)
        `)
        .eq('status', 'in_progress')
        .lt('created_at', overdueDate.toISOString());

      if (error) throw error;

      for (const order of overdueOrders) {
        try {
          // Envoyer une notification de rappel
          await notificationService.sendSystemNotification(
            order.seller_id,
            'Commande en retard',
            `La commande "${order.mission?.title}" est en retard. Veuillez la finaliser rapidement.`,
            {
              order_id: order.id,
              mission_id: order.mission_id,
              overdue_days: Math.floor((new Date() - new Date(order.created_at)) / (1000 * 60 * 60 * 24))
            }
          );

          logger.warn('Commande en retard détectée', {
            orderId: order.id,
            sellerId: order.seller_id,
            missionTitle: order.mission?.title
          });

        } catch (orderError) {
          logger.error('Erreur traitement commande en retard', {
            orderId: order.id,
            error: orderError.message
          });
        }
      }

      logger.info(`✅ Vérification commandes en retard terminée: ${jobId}`, {
        overdueCount: overdueOrders.length
      });

    } catch (error) {
      logger.error(`❌ Échec vérification commandes en retard: ${jobId}`, {
        error: error.message
      });
    }
  }

  async checkPendingOrders() {
    const jobId = `check_pending_orders_${Date.now()}`;
    
    try {
      logger.info(`🔄 Vérification des commandes en attente: ${jobId}`);

      const expirationDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 heures

      const { data: expiredOrders, error } = await database.client
        .from('orders')
        .select('*')
        .eq('status', 'pending')
        .lt('created_at', expirationDate.toISOString());

      if (error) throw error;

      for (const order of expiredOrders) {
        try {
          // Annuler les commandes en attente depuis plus de 24h
          await database.safeUpdate(
            'orders',
            {
              status: 'cancelled',
              cancellation_reason: 'Expiré - Paiement non effectué dans les délais',
              cancelled_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            },
            { id: order.id }
          );

          // Notifier l'acheteur
          await notificationService.sendSystemNotification(
            order.buyer_id,
            'Commande expirée',
            'Votre commande a été annulée car le paiement n\'a pas été effectué dans les délais.',
            {
              order_id: order.id,
              mission_id: order.mission_id
            }
          );

          logger.info('Commande en attente annulée', {
            orderId: order.id,
            buyerId: order.buyer_id
          });

        } catch (orderError) {
          logger.error('Erreur annulation commande expirée', {
            orderId: order.id,
            error: orderError.message
          });
        }
      }

      logger.info(`✅ Vérification commandes en attente terminée: ${jobId}`, {
        expiredCount: expiredOrders.length
      });

    } catch (error) {
      logger.error(`❌ Échec vérification commandes en attente: ${jobId}`, {
        error: error.message
      });
    }
  }

  async autoCompleteOrders() {
    const jobId = `auto_complete_orders_${Date.now()}`;
    
    try {
      logger.info(`✅ Vérification auto-complétion commandes: ${jobId}`);

      const autoCompleteDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000); // 3 jours après livraison

      const { data: deliveredOrders, error } = await database.client
        .from('orders')
        .select(`
          *,
          mission:missions(title),
          buyer:users(first_name, last_name),
          seller:users(first_name, last_name)
        `)
        .eq('status', 'awaiting_review')
        .lt('delivered_at', autoCompleteDate.toISOString());

      if (error) throw error;

      for (const order of deliveredOrders) {
        try {
          // Auto-compléter la commande après 3 jours sans action de l'acheteur
          await database.safeUpdate(
            'orders',
            {
              status: 'completed',
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            },
            { id: order.id }
          );

          // Libérer les fonds au vendeur
          await database.safeUpdate(
            'users',
            {
              balance: database.client.raw(`balance + ${order.amount}`),
              completed_orders: database.client.raw('completed_orders + 1'),
              updated_at: new Date().toISOString()
            },
            { id: order.seller_id }
          );

          // Notifier les parties
          await notificationService.sendSystemNotification(
            order.seller_id,
            'Commande auto-complétée',
            `La commande "${order.mission?.title}" a été automatiquement marquée comme complétée.`,
            {
              order_id: order.id,
              mission_id: order.mission_id,
              amount: order.amount
            }
          );

          logger.info('Commande auto-complétée', {
            orderId: order.id,
            sellerId: order.seller_id,
            amount: order.amount
          });

        } catch (orderError) {
          logger.error('Erreur auto-complétion commande', {
            orderId: order.id,
            error: orderError.message
          });
        }
      }

      logger.info(`✅ Auto-complétion commandes terminée: ${jobId}`, {
        autoCompletedCount: deliveredOrders.length
      });

    } catch (error) {
      logger.error(`❌ Échec auto-complétion commandes: ${jobId}`, {
        error: error.message
      });
    }
  }
}

// Démarrer le cron
new OrderCron();

module.exports = OrderCron;