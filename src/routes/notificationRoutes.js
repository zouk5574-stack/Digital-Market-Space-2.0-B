const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const authMiddleware = require('../middleware/authMiddleware');

// Récupération des notifications
router.get('/',
  authMiddleware.authenticateToken,
  notificationController.getUserNotifications
);

// Marquer comme lu
router.put('/:notificationId/read',
  authMiddleware.authenticateToken,
  notificationController.markAsRead
);

// Marquer toutes comme lues
router.put('/read-all',
  authMiddleware.authenticateToken,
  notificationController.markAllAsRead
);

// Supprimer une notification
router.delete('/:notificationId',
  authMiddleware.authenticateToken,
  notificationController.deleteNotification
);

// Préférences de notification
router.get('/preferences',
  authMiddleware.authenticateToken,
  notificationController.getNotificationPreferences
);

router.put('/preferences',
  authMiddleware.authenticateToken,
  notificationController.updateNotificationPreferences
);

module.exports = router;