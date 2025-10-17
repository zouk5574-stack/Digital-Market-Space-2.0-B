// src/routes/fedapayRoutes.js

import express from 'express';
import { 
    initFedapayPayment, 
    handleFedapayWebhook,
    // Importer la fonction pour l'initialisation de l'Escrow
    initFedapayEscrowPayment 
} from '../controllers/fedapayController.js'; 
import { isAuthenticated } from '../middleware/authMiddleware.js'; 
import { rawBodyMiddleware } from '../middleware/rawBodyMiddleware.js'; 

const router = express.Router();

/**
 * @route POST /api/fedapay/init-payment
 * @description Initialise une transaction FedaPay pour une commande de produits (E-commerce).
 * @access Private (Acheteur authentifié)
 */
router.post('/init-payment', isAuthenticated, initFedapayPayment);

/**
 * @route POST /api/fedapay/init-escrow
 * @description Initialise une transaction FedaPay pour le séquestre d'une mission (Freelance).
 * @access Private (Acheteur authentifié)
 * NOTE : Cette route sera appelée par 'freelanceController.acceptFreelanceApplication' qui déléguera la création
 * du lien de paiement.
 */
// router.post('/init-escrow', isAuthenticated, initFedapayEscrowPayment); // ⚠️ Supprimé car la logique est gérée DANS le freelanceController.

/**
 * @route POST /api/fedapay/webhook
 * @description Gère les notifications de Fedapay (paiement réussi, échec, Escrow, etc.).
 * @access Public (Appelé par FedaPay)
 */
router.post('/webhook', rawBodyMiddleware, handleFedapayWebhook);

export default router;
