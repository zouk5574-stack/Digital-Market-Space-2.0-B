import express from "express";
import { supabase } from "../server.js";

const router = express.Router();

/**
 * 👉 Initier un paiement avec Fedapay
 * Ex: POST /api/fedapay/init
 * Body attendu: { userId, montant, devise, description }
 */
router.post("/init", async (req, res) => {
  try {
    const { userId, montant, devise, description } = req.body;

    if (!userId || !montant || !devise) {
      return res.status(400).json({ error: "Données manquantes" });
    }

    // 🔑 Récupération des clés API FedaPay depuis fournisseurs_de_paiement
    const { data: provider, error: providerError } = await supabase
      .from("fournisseurs_de_paiement")
      .select("*")
      .eq("nom", "fedapay")
      .eq("est_actif", true)
      .single();

    if (providerError || !provider) {
      return res.status(500).json({ error: "FedaPay non configuré" });
    }

    // Ici tu utiliserais le SDK officiel Fedapay ou un appel HTTP
    // Mais on va simuler la création d’une transaction côté Fedapay
    const fedapayTransactionId = "FD_" + Date.now(); // fake ID

    // Enregistrer la transaction en base
    const { data, error } = await supabase.from("transactions").insert([
      {
        id: crypto.randomUUID(),
        "ID de l’utilisateur": userId,
        fournisseur: "fedapay",
        identifiant_fournisseur: fedapayTransactionId,
        montant,
        devise,
        description,
        statut: "pending",
        créé_à: new Date(),
        "mis à jour à": new Date(),
      },
    ]);

    if (error) {
      console.error("Erreur insertion transaction:", error);
      return res.status(500).json({ error: "Erreur enregistrement transaction" });
    }

    return res.json({
      message: "Paiement initié",
      transactionId: fedapayTransactionId,
      redirectUrl: `https://checkout.fedapay.com/${fedapayTransactionId}`, // simuler URL checkout
    });
  } catch (err) {
    console.error("Erreur init paiement:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

/**
 * 👉 Webhook Fedapay (callback après paiement)
 * FedaPay enverra une notification ici
 */
router.post("/webhook", async (req, res) => {
  try {
    const { transactionId, statut } = req.body;

    if (!transactionId || !statut) {
      return res.status(400).json({ error: "Données manquantes dans le webhook" });
    }

    // Mettre à jour la transaction
    const { data, error } = await supabase
      .from("transactions")
      .update({
        statut,
        "mis à jour à": new Date(),
      })
      .eq("identifiant_fournisseur", transactionId);

    if (error) {
      console.error("Erreur mise à jour transaction:", error);
      return res.status(500).json({ error: "Erreur mise à jour transaction" });
    }

    return res.json({ message: "Webhook reçu et traité" });
  } catch (err) {
    console.error("Erreur webhook Fedapay:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

export default router;
