// src/routes/fedapayRoutes.js

import express from 'express';
import { 
    initFedapayPayment, 
    handleFedapayWebhook 
} from '../controllers/fedapayController.js'; 
import { isAuthenticated } from '../middleware/authMiddleware.js'; // Assurez-vous d'avoir ce middleware pour les paiements
import { rawBodyMiddleware } from '../middleware/rawBodyMiddleware.js'; // 🚨 CRITIQUE pour le Webhook

const router = express.Router();

/**
 * @route POST /api/fedapay/init-payment
 * @description Initialise une transaction FedaPay pour une commande de produits.
 * @access Private (Acheteur authentifié)
 */
router.post('/init-payment', isAuthenticated, initFedapayPayment);

/**
 * @route POST /api/fedapay/webhook
 * @description Gère les notifications de Fedapay (paiement réussi, échec, etc.).
 * @access Public (Appelé par FedaPay)
 * * 🚨 CRITIQUE : Utilisation du middleware rawBodyMiddleware pour capturer le corps brut
 * de la requête nécessaire à la vérification de la signature HMAC.
 */
router.post('/webhook', rawBodyMiddleware, handleFedapayWebhook);

export default router;

