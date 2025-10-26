const express = require('express');
const router = express.Router();

// Import des routes existantes
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const productRoutes = require('./productRoutes');
const shopRoutes = require('./shopRoutes');
const orderRoutes = require('./orderRoutes');
const categoryRoutes = require('./categoryRoutes');
const walletRoutes = require('./walletRoutes');
const paymentRoutes = require('./paymentRoutes');
const notificationRoutes = require('./notificationRoutes');
const freelanceRoutes = require('./freelanceRoutes');
const withdrawalRoutes = require('./withdrawalRoutes');
const fileRoutes = require('./fileRoutes');

// Nouvelles routes
const adminRoutes = require('./adminRoutes');
const statsRoutes = require('./statsRoutes');
const aiRoutes = require('./aiRoutes');
const fedapayRoutes = require('./fedapayRoutes');
const logRoutes = require('./logRoutes');
const paymentProviderRoutes = require('./paymentProviderRoutes');
const platformSettingsRoutes = require('./platformSettingsRoutes');

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

// Nouvelles routes
router.use('/admin', adminRoutes);
router.use('/stats', statsRoutes);
router.use('/ai', aiRoutes);
router.use('/fedapay', fedapayRoutes);
router.use('/logs', logRoutes);
router.use('/payment-providers', paymentProviderRoutes);
router.use('/platform-settings', platformSettingsRoutes);

module.exports = router;
