const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, authorize } = require('../middleware/auth');

// Toutes les routes admin nécessitent une authentification et le rôle admin
router.use(authenticate);
router.use(authorize(['admin']));

// Gestion des utilisateurs
router.get('/users', adminController.getUsers);
router.get('/users/:userId', adminController.getUserDetails);
router.patch('/users/:userId/status', adminController.updateUserStatus);
router.patch('/users/:userId/role', adminController.updateUserRole);

// Statistiques plateforme
router.get('/stats/platform', adminController.getPlatformStats);
router.get('/stats/sales', adminController.getSalesStats);
router.get('/stats/users', adminController.getUserStats);

// Gestion des contenus
router.get('/products/moderation', adminController.getProductsForModeration);
router.patch('/products/:productId/status', adminController.updateProductStatus);
router.get('/shops/verification', adminController.getShopsForVerification);
router.patch('/shops/:shopId/verification', adminController.verifyShop);

// Logs et audit
router.get('/logs', adminController.getAdminLogs);
router.get('/logs/:logId', adminController.getLogDetails);

// Paramètres plateforme
router.get('/settings', adminController.getPlatformSettings);
router.patch('/settings', adminController.updatePlatformSettings);

module.exports = router;
