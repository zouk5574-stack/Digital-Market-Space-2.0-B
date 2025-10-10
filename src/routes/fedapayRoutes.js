// src/routes/fedapayRoutes.js

import express from "express";
import { initFedapayPayment, handleFedapayWebhook } from "../controllers/fedapayController.js";
import { authenticateJWT as authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

/**
 * 🎯 POST /api/fedapay/init
 * Role: BUYER.
 * Fonction : Initie la transaction de paiement pour une commande (order_id).
 * Nécessite l'authentification.
 */
router.post("/init", authMiddleware, initFedapayPayment);

/**
 * 🔔 POST /api/fedapay/webhook
 * Role: PUBLIC/FEDAPAY API.
 * Fonction : Reçoit la notification sécurisée de paiement confirmé de Fedapay.
 * IMPORTANT : Cette route est publique et doit être capable de lire le corps brut (rawBody)
 * pour la vérification de la signature HMAC.
 */
router.post("/webhook", handleFedapayWebhook);

export default router;
