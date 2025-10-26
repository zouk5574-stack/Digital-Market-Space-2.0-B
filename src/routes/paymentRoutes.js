// src/routes/paymentRoutes.js
import express from 'express';
import {
  getPayments,
  createPaymentSession,
  updatePaymentStatus
} from '../controllers/paymentController.js';

const router = express.Router();

router.get('/', getPayments);
router.post('/sessions', createPaymentSession);
router.patch('/:id/status', updatePaymentStatus);

export default router;
