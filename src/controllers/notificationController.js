import { notificationService } from '../services/notificationService.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { log } from '../utils/logger.js';

export const notificationController = {
  // Récupération des notifications
  getNotifications: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { page = 1, limit = 20, unread_only } = req.query;

    const result = await notificationService.getUserNotifications(
      userId,
      parseInt(page),
      parseInt(limit),
      unread_only === 'true'
    );

    res.json({
      success: true,
      data: {
        notifications: result.notifications,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: result.total,
          totalPages: Math.ceil(result.total / parseInt(limit))
        },
        unread_count: result.unreadCount
      }
    });
  }),

  // Marquer une notification comme lue
  markAsRead: asyncHandler(async (req, res) => {
    const { notification_id } = req.params;
    const userId = req.user.id;

    const notification = await notificationService.markAsRead(notification_id, userId);

    if (!notification) {
      throw new AppError('Notification non trouvée', 404);
    }

    log.info('Notification marquée comme lue', {
      notificationId: notification_id,
      userId: userId
    });

    res.json({
      success: true,
      message: 'Notification marquée comme lue',
      data: {
        notification: notification
      }
    });
  }),

  // Marquer toutes les notifications comme lues
  markAllAsRead: asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const count = await notificationService.markAllAsRead(userId);

    log.info('Toutes notifications marquées comme lues', {
      userId: userId,
      count: count
    });

    res.json({
      success: true,
      message: `${count} notification(s) marquée(s) comme lue(s)`,
      data: {
        marked_count: count
      }
    });
  }),

  // Supprimer une notification
  deleteNotification: asyncHandler(async (req, res) => {
    const { notification_id } = req.params;
    const userId = req.user.id;

    const { data: notification, error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notification_id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !notification) {
      throw new AppError('Notification non trouvée', 404);
    }

    log.info('Notification supprimée', {
      notificationId: notification_id,
      userId: userId
    });

    res.json({
      success: true,
      message: 'Notification supprimée avec succès',
      data: {
        deleted_notification: notification
      }
    });
  }),

  // Statistiques des notifications
  getNotificationStats: asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const unreadCount = await notificationService.getUnreadCount(userId);

    // Dernières notifications non lues
    const { data: recentUnread } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(5);

    // Distribution par type
    const { data: typeDistribution } = await supabase
      .from('notifications')
      .select('type')
      .eq('user_id', userId)
      .eq('is_read', false);

    const typeCounts = {};
    typeDistribution?.forEach(notif => {
      typeCounts[notif.type] = (typeCounts[notif.type] || 0) + 1;
    });

    const stats = {
      unread_count: unreadCount,
      recent_unread: recentUnread || [],
      type_distribution: typeCounts,
      total_notifications: await this.getTotalNotificationCount(userId)
    };

    res.json({
      success: true,
      data: stats
    });
  }),

  // Nombre total de notifications
  async getTotalNotificationCount(userId) {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    return count || 0;
  }
};