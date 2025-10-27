import { supabase } from '../config/database.js';
import { log } from '../utils/logger.js';

export class NotificationService {
  // Création d'une notification
  async createNotification(userId, type, title, message, data = {}) {
    try {
      const notification = {
        user_id: userId,
        type: type,
        title: title,
        message: message,
        data: data,
        is_read: false,
        created_at: new Date().toISOString(),
        expires_at: this.calculateExpiry(type)
      };

      const { data: createdNotification, error } = await supabase
        .from('notifications')
        .insert(notification)
        .select()
        .single();

      if (error) {
        log.error('Erreur création notification:', error);
        return null;
      }

      log.info('Notification créée', {
        notificationId: createdNotification.id,
        userId: userId,
        type: type
      });

      return createdNotification;
    } catch (error) {
      log.error('Erreur inattendue création notification:', error);
      return null;
    }
  }

  // Calcul de la date d'expiration selon le type
  calculateExpiry(type) {
    const now = new Date();
    
    switch (type) {
      case 'payment_success':
      case 'withdrawal_approved':
        return new Date(now.setDate(now.getDate() + 30)); // 30 jours
      
      case 'mission_assigned':
      case 'order_completed':
        return new Date(now.setDate(now.getDate() + 15)); // 15 jours
      
      case 'system_alert':
        return new Date(now.setDate(now.getDate() + 7)); // 7 jours
      
      default:
        return new Date(now.setDate(now.getDate() + 30)); // 30 jours par défaut
    }
  }

  // Notification de paiement réussi
  async sendPaymentSuccessNotification(userId, paymentData) {
    return await this.createNotification(
      userId,
      'payment_success',
      'Paiement Réussi',
      `Votre paiement de ${paymentData.amount} FCFA a été traité avec succès.`,
      {
        payment_id: paymentData.payment_id,
        order_id: paymentData.order_id,
        amount: paymentData.amount,
        transaction_id: paymentData.transaction_id
      }
    );
  }

  // Notification de retrait approuvé
  async sendWithdrawalApprovedNotification(userId, withdrawalData) {
    return await this.createNotification(
      userId,
      'withdrawal_approved',
      'Retrait Approuvé',
      `Votre retrait de ${withdrawalData.amount} FCFA a été approuvé et sera traité sous 24h.`,
      {
        withdrawal_id: withdrawalData.withdrawal_id,
        amount: withdrawalData.amount,
        payment_method: withdrawalData.payment_method,
        reference: withdrawalData.reference
      }
    );
  }

  // Notification de nouvelle mission
  async sendNewMissionNotification(userId, missionData) {
    return await this.createNotification(
      userId,
      'new_mission',
      'Nouvelle Mission Disponible',
      `Une nouvelle mission "${missionData.title}" correspond à vos compétences.`,
      {
        mission_id: missionData.mission_id,
        title: missionData.title,
        budget: missionData.budget,
        category: missionData.category
      }
    );
  }

  // Notification de mission assignée
  async sendMissionAssignedNotification(userId, missionData) {
    return await this.createNotification(
      userId,
      'mission_assigned',
      'Mission Assignée',
      `Vous avez été sélectionné pour la mission "${missionData.title}".`,
      {
        mission_id: missionData.mission_id,
        order_id: missionData.order_id,
        title: missionData.title,
        budget: missionData.budget
      }
    );
  }

  // Notification de commande terminée
  async sendOrderCompletedNotification(userId, orderData) {
    return await this.createNotification(
      userId,
      'order_completed',
      'Commande Terminée',
      `La commande #${orderData.order_id} a été marquée comme terminée.`,
      {
        order_id: orderData.order_id,
        mission_id: orderData.mission_id,
        amount: orderData.amount
      }
    );
  }

  // Notification système
  async sendSystemNotification(userId, title, message, data = {}) {
    return await this.createNotification(
      userId,
      'system_alert',
      title,
      message,
      data
    );
  }

  // Marquer une notification comme lue
  async markAsRead(notificationId, userId) {
    try {
      const { data: notification, error } = await supabase
        .from('notifications')
        .update({
          is_read: true,
          read_at: new Date().toISOString()
        })
        .eq('id', notificationId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        log.error('Erreur marquage notification comme lue:', error);
        return null;
      }

      return notification;
    } catch (error) {
      log.error('Erreur inattendue marquage notification:', error);
      return null;
    }
  }

  // Marquer toutes les notifications comme lues
  async markAllAsRead(userId) {
    try {
      const { data: notifications, error } = await supabase
        .from('notifications')
        .update({
          is_read: true,
          read_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('is_read', false)
        .select();

      if (error) {
        log.error('Erreur marquage toutes notifications comme lues:', error);
        return 0;
      }

      log.info('Toutes notifications marquées comme lues', {
        userId: userId,
        count: notifications?.length || 0
      });

      return notifications?.length || 0;
    } catch (error) {
      log.error('Erreur inattendue marquage toutes notifications:', error);
      return 0;
    }
  }

  // Récupération des notifications
  async getUserNotifications(userId, page = 1, limit = 20, unreadOnly = false) {
    try {
      const offset = (page - 1) * limit;

      let query = supabase
        .from('notifications')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (unreadOnly) {
        query = query.eq('is_read', false);
      }

      query = query.range(offset, offset + limit - 1);

      const { data: notifications, error, count } = await query;

      if (error) {
        log.error('Erreur récupération notifications:', error);
        return { notifications: [], total: 0 };
      }

      return {
        notifications: notifications || [],
        total: count || 0,
        unreadCount: await this.getUnreadCount(userId)
      };
    } catch (error) {
      log.error('Erreur inattendue récupération notifications:', error);
      return { notifications: [], total: 0, unreadCount: 0 };
    }
  }

  // Nombre de notifications non lues
  async getUnreadCount(userId) {
    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (error) {
        log.error('Erreur comptage notifications non lues:', error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      log.error('Erreur inattendue comptage notifications:', error);
      return 0;
    }
  }

  // Suppression des notifications expirées
  async cleanupExpiredNotifications() {
    try {
      const { data: deletedNotifications, error } = await supabase
        .from('notifications')
        .delete()
        .lt('expires_at', new Date().toISOString())
        .select();

      if (error) {
        log.error('Erreur nettoyage notifications expirées:', error);
        return 0;
      }

      log.info('Notifications expirées nettoyées', {
        count: deletedNotifications?.length || 0
      });

      return deletedNotifications?.length || 0;
    } catch (error) {
      log.error('Erreur inattendue nettoyage notifications:', error);
      return 0;
    }
  }
}

export const notificationService = new NotificationService();