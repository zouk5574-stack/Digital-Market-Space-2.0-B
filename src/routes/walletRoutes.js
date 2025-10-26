// src/routes/walletRoutes.js
import express from 'express';
import {
  getWalletByUserId,
  createWallet,
  updateWalletBalance,
  getWalletTransactions
} from '../controllers/walletController.js';

const router = express.Router();

router.get('/user/:user_id', getWalletByUserId);
router.post('/', createWallet);
router.patch('/:id/balance', updateWalletBalance);
router.get('/:wallet_id/transactions', getWalletTransactions);

export default router;
