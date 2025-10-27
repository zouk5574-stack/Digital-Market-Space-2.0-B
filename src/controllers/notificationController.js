const notificationService = require('../services/notificationService');
const { Response, Error } = require('../utils/helpers');
const logger = require('../utils/logger');

class NotificationController {
  
  async getUserNotifications(req, res) {
    try {
      const userId = req.user.id;
      const filters = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        type: req.query.type,
        unread_only: req.query.unread_only === 'true'
      };

      logger.debug('Récupération notifications utilisateur', { userId, filters });

      const result = await notificationService.getUserNotifications(userId, filters);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);

    } catch (error) {
      logger.error('Erreur récupération notifications', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la récupération des notifications'));
    }
  }

  async markAsRead(req, res) {
    try {
      const { notificationId } = req.params;
      const userId = req.user.id;

      logger.debug('Marquage notification comme lue', { notificationId, userId });

      const result = await notificationService.markAsRead(notificationId, userId);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);

    } catch (error) {
      logger.error('Erreur marquage notification comme lue', {
        userId: req.user.id,
        notificationId: req.params.notificationId,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors du marquage de la notification'));
    }
  }

  async markAllAsRead(req, res) {
    try {
      const userId = req.user.id;

      logger.info('Marquage toutes les notifications comme lues', { userId });

      const result = await notificationService.markAllAsRead(userId);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);

    } catch (error) {
      logger.error('Erreur marquage toutes notifications comme lues', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors du marquage des notifications'));
    }
  }

  async deleteNotification(req, res) {
    try {
      const { notificationId } = req.params;
      const userId = req.user.id;

      logger.info('Suppression notification', { notificationId, userId });

      const result = await notificationService.deleteNotification(notificationId, userId);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);

    } catch (error) {
      logger.error('Erreur suppression notification', {
        userId: req.user.id,
        notificationId: req.params.notificationId,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la suppression de la notification'));
    }
  }

  async getNotificationPreferences(req, res) {
    try {
      const userId = req.user.id;

      logger.debug('Récupération préférences notifications', { userId });

      const result = await notificationService.getNotificationPreferences(userId);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);

    } catch (error) {
      logger.error('Erreur récupération préférences notifications', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la récupération des préférences'));
    }
  }

  async updateNotificationPreferences(req, res) {
    try {
      const preferences = req.body;
      const userId = req.user.id;

      logger.info('Mise à jour préférences notifications', { userId, preferences });

      const result = await notificationService.updateNotificationPreferences(userId, preferences);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);

    } catch (error) {
      logger.error('Erreur mise à jour préférences notifications', {
        userId: req.user.id,
        error: error.message,
        preferences: req.body
      });

      res.status(500).json(Response.error('Erreur lors de la mise à jour des préférences'));
    }
  }
}

module.exports = new NotificationController();