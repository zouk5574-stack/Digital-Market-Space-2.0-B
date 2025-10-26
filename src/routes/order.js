// src/routes/order.js
import express from 'express';
import {
  getOrders,
  getOrderById,
  createOrder,
  updateOrderStatus
} from '../controllers/orderController.js';

const router = express.Router();

router.get('/', getOrders);
router.get('/:id', getOrderById);
router.post('/', createOrder);
router.patch('/:id/status', updateOrderStatus);

export default router;
