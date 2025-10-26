// src/routes/notificationRoutes.js
import express from 'express';
import {
  getUserNotifications,
  createNotification,
  markNotificationAsRead,
  deleteNotification
} from '../controllers/notificationController.js';

const router = express.Router();

router.get('/user/:user_id', getUserNotifications);
router.post('/', createNotification);
router.patch('/:id/read', markNotificationAsRead);
router.delete('/:id', deleteNotification);

export default router;
