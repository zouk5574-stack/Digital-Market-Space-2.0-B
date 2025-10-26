const express = require('express');
const router = express.Router();
const statsController = require('../controllers/statsController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// Tableau de bord statistiques
router.get('/dashboard', statsController.getDashboardStats);
router.get('/sales-analytics', statsController.getSalesAnalytics);
router.get('/product-performance', statsController.getProductPerformance);
router.get('/revenue-analytics', statsController.getRevenueAnalytics);

module.exports = router;
