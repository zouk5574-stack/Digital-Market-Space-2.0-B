import express from 'express';
const router = express.Router();

// Import des routes
import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import productRoutes from './productRoutes.js';
import shopRoutes from './shopRoutes.js';
import orderRoutes from './orderRoutes.js';
import categoryRoutes from './categoryRoutes.js';
import walletRoutes from './walletRoutes.js';
import paymentRoutes from './paymentRoutes.js';
import notificationRoutes from './notificationRoutes.js';
import freelanceRoutes from './freelanceRoutes.js';
import withdrawalRoutes from './withdrawalRoutes.js';
import fileRoutes from './fileRoutes.js';
import adminRoutes from './adminRoutes.js';
import statsRoutes from './statsRoutes.js';
import aiRoutes from './aiRoutes.js';
import fedapayRoutes from './fedapayRoutes.js';
import messageRoutes from './messageRoutes.js';
import commissionRoutes from './commissionRoutes.js';
import platformSettingsRoutes from './platformSettingsRoutes.js';

// Routes publiques
router.use('/auth', authRoutes);
router.use('/categories', categoryRoutes);

// Routes protégées
router.use('/users', userRoutes);
router.use('/products', productRoutes);
router.use('/shops', shopRoutes);
router.use('/orders', orderRoutes);
router.use('/wallet', walletRoutes);
router.use('/payments', paymentRoutes);
router.use('/notifications', notificationRoutes);
router.use('/freelance', freelanceRoutes);
router.use('/withdrawals', withdrawalRoutes);
router.use('/files', fileRoutes);
router.use('/messages', messageRoutes);
router.use('/commissions', commissionRoutes);

// Routes admin et stats
router.use('/admin', adminRoutes);
router.use('/stats', statsRoutes);
router.use('/ai', aiRoutes);
router.use('/fedapay', fedapayRoutes);
router.use('/platform-settings', platformSettingsRoutes);

export default router;
