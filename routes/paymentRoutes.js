import express from "express";
import { supabase } from "../server.js";

const router = express.Router();

/**
 * 👉 Initier un paiement générique
 * Body attendu: { userId, montant, devise, description, provider }
 */
router.post("/init", async (req, res) => {
  try {
    const { userId, montant, devise, description, provider } = req.body;

    if (!userId || !montant || !devise || !provider) {
      return res.status(400).json({ error: "Données manquantes" });
    }

    if (provider === "fedapay") {
      // On redirige vers l’API FedaPay
      return res.redirect(307, "/api/fedapay/init");
    }

    return res.status(400).json({ error: "Fournisseur non supporté pour le moment" });
  } catch (err) {
    console.error("Erreur init paiement générique:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
