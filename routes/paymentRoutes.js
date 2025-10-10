// src/routes/paymentRoutes.js
import express from "express";

const router = express.Router();

/**
 * 👉 POST /api/payment/init : Initier un paiement générique
 * Redirige vers le contrôleur du fournisseur de paiement spécifique
 */
router.post("/init", async (req, res) => {
  try {
    const { userId, montant, devise, description, provider } = req.body;

    if (!userId || !montant || !devise || !provider) {
      return res.status(400).json({ error: "Données manquantes" });
    }

    // Ici, vous pouvez ajouter une validation complexe des données...
    
    if (provider === "fedapay") {
      // Redirection vers le sous-module Fedapay
      // (Nécessite que vous ayez monté fedapayRoutes dans server.js)
      return res.redirect(307, "/api/fedapay/init"); 
    }

    return res.status(400).json({ error: `Fournisseur de paiement "${provider}" non supporté pour le moment` });
  } catch (err) {
    console.error("Erreur init paiement générique:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
