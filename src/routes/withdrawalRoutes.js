// src/routes/withdrawalRoutes.js
import express from 'express';
import {
  createWithdrawal,
  updateWithdrawalStatus
} from '../controllers/withdrawalController.js';

const router = express.Router();

router.post('/', createWithdrawal);
router.patch('/:id/status', updateWithdrawalStatus);

export default router;
