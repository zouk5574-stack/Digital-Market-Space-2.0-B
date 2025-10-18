// =========================================================
// src/routes/fedapayRoutes.js (VERSION COMPLÈTE OPTIMISÉE)
// =========================================================

import express from 'express';
import {
  initFedapayPayment,
  handleFedapayWebhook,
  initFedapayEscrowPayment,
} from '../controllers/fedapayController.js';
import { isAuthenticated } from '../middleware/authMiddleware.js';
import { rawBodyMiddleware } from '../middleware/rawBodyMiddleware.js';

const router = express.Router();

/**
 * ==========================================
 * 🎯 FedaPay ROUTES - PAYMENTS & WEBHOOKS
 * ==========================================
 */

/**
 * @route POST /api/fedapay/init-payment
 * @description Initialise un paiement FedaPay pour une commande de produits digitaux (E-commerce).
 * @access Private (Acheteur authentifié)
 */
router.post('/init-payment', isAuthenticated, initFedapayPayment);

/**
 * @route POST /api/fedapay/init-escrow
 * @description Initialise un paiement FedaPay en mode séquestre (Freelance mission escrow).
 * @access Private (Client authentifié)
 * ⚙️ Utilisée uniquement par le contrôleur FreelanceController lorsqu'une mission est acceptée.
 */
router.post('/init-escrow', isAuthenticated, initFedapayEscrowPayment);

/**
 * @route POST /api/fedapay/webhook
 * @description Reçoit les notifications FedaPay (succès, échec, escrow release, refund, etc.)
 * @access Public (appelé directement par FedaPay)
 * ⚠️ Utilise rawBodyMiddleware pour valider la signature FedaPay avant parsing JSON
 */
router.post('/webhook', rawBodyMiddleware, handleFedapayWebhook);

export default router;