// src/routes/paymentRoutes.js

import express from "express";
import { authenticateJWT } from "../middleware/authMiddleware.js"; // ⬅️ Ajout de la protection

const router = express.Router();

/**
 * 👉 POST /api/payment/init : Initier un paiement générique
 * Abstraction future pour plusieurs fournisseurs (Paypal, Stripe, etc.).
 */
router.post("/init", authenticateJWT, async (req, res) => {
  try {
    const { order_id, provider } = req.body; // Se concentrer sur order_id pour la cohérence

    if (!order_id || !provider) {
      return res.status(400).json({ error: "order_id et provider sont requis." });
    }

    if (provider === "fedapay") {
      // ⚠️ IMPORTANT :
      // Plutôt que de faire une redirection, nous nous contenterons d'un message
      // et le frontend saura appeler directement /api/fedapay/init
      // ou nous monterons la logique Fedapay ici plus tard.
      // Pour l'assemblage, nous laissons le frontend appeler /api/fedapay/init
      return res.status(200).json({ 
          message: "Utiliser l'endpoint Fedapay dédié pour l'initialisation.",
          endpoint: "/api/fedapay/init",
          order_id: order_id
      });
    }

    return res.status(400).json({ error: `Fournisseur de paiement "${provider}" non supporté pour le moment` });
  } catch (err) {
    console.error("Erreur init paiement générique:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
