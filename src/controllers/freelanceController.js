// src/controllers/freelanceController.js

import { supabase } from "../server.js";

// Commission : Taux de commission par défaut pour la plateforme
const COMMISSION_RATE = 0.10; // 10%

// ========================
// ✅ Créer une mission freelance (côté acheteur)
// ========================
export async function createFreelanceMission(req, res) {
  try {
    const buyer_id = req.user.db.id;
    const { title, description, budget, deadline, category } = req.body;

    // La validation des champs a été gérée par express-validator dans la route,
    // mais on garde un contrôle de sécurité de base.
    if (!title || !description || !budget) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }

    const { data: mission, error } = await supabase
      .from("freelance_missions")
      .insert([{
        buyer_id,
        title,
        description,
        budget: parseFloat(budget),
        deadline,
        category,
        status: "open"
      }])
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({ message: "Mission créée ✅", mission });
  } catch (err) {
    console.error("Create freelance mission error:", err);
    // Affichage des détails si c'est une erreur DB connue (ex: format de budget)
    return res.status(500).json({ error: "Erreur serveur lors de la création de la mission.", details: err.message || err });
  }
}

// ========================
// ✅ Postuler à une mission (côté VENDEUR)
// NOTE: On suppose que mission_id est passé via req.body pour l'instant.
// ========================
export async function applyToMission(req, res) {
  try {
    const seller_id = req.user.db.id; // ⬅️ Utilisation de seller_id
    const { mission_id, proposal, proposed_price } = req.body;

    if (!mission_id || !proposal || !proposed_price) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }

    const { data: application, error } = await supabase
      .from("freelance_applications")
      .insert([{
        mission_id,
        seller_id, // ⬅️ Utilisation de seller_id
        proposal,
        proposed_price: parseFloat(proposed_price)
      }])
      .select()
      .single();

    if (error) {
       if (error.code === '23505') { 
            return res.status(409).json({ error: "Vous avez déjà postulé à cette mission." });
       }
       throw error;
    }

    return res.status(201).json({ message: "Candidature envoyée ✅", application });
  } catch (err) {
    console.error("Apply to mission error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message || err });
  }
}

// ========================
// ✅ Livraison finale par le VENDEUR
// ========================
export async function deliverWork(req, res) {
  try {
    const seller_id = req.user.db.id; // ⬅️ Utilisation de seller_id
    const { mission_id, delivery_note, file_url } = req.body;

    if (!mission_id || !delivery_note) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }

    // TODO CRITIQUE: Vérifier ici que le seller_id correspond au vendeur ATTRIBUÉ à la mission.
    // Cela nécessite d'ajouter un champ `assigned_seller_id` dans `freelance_missions` lors de l'acceptation d'une candidature.

    const { data: delivery, error } = await supabase
      .from("freelance_deliveries")
      .insert([{
        mission_id,
        seller_id, // ⬅️ Utilisation de seller_id
        delivery_note,
        file_url,
        status: "delivered"
      }])
      .select()
      .single();

    if (error) throw error;

    // Mettre à jour le statut de la mission si elle était 'in_progress' ou autre
    await supabase.from("freelance_missions").update({ status: "in_progress" }).eq("id", mission_id);


    return res.status(201).json({ message: "Travail livré ✅", delivery });
  } catch (err) {
    console.error("Deliver work error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message || err });
  }
}

// ========================
// ✅ Validation par l’acheteur (avec gestion commission)
// ========================
export async function validateDelivery(req, res) {
  // NOTE: Dans un environnement réel, toutes ces étapes (DB, wallet) seraient dans une SEULE transaction
  // (ex: Stored Procedure PostgreSQL) pour garantir l'atomicité.

  try {
    const buyer_id = req.user.db.id;
    const { delivery_id } = req.body;

    // 1. Récupérer les données critiques (mission, vendeur, budget)
    const { data: delivery, error: fetchError } = await supabase
      .from("freelance_deliveries")
      .select(`
        mission_id, 
        seller_id, 
        status, 
        mission:mission_id (buyer_id, budget), 
        seller:seller_id (is_commission_exempt) 
      `)
      .eq("id", delivery_id)
      .single();

    if (fetchError || !delivery) {
      return res.status(404).json({ error: "Livraison introuvable" });
    }

    // 2. Vérification d'autorisation (acheteur, statut)
    if (delivery.mission.buyer_id !== buyer_id) {
      return res.status(403).json({ error: "Accès refusé. Vous n'êtes pas l'acheteur de cette mission." });
    }
    if (delivery.status !== 'delivered') {
      return res.status(400).json({ error: "La livraison n'est pas en attente de validation." });
    }
    
    // 3. Calcul du montant
    const finalBudget = delivery.mission.budget;
    let commission = 0;
    
    // Application de la commission
    if (!delivery.seller.is_commission_exempt) {
        commission = finalBudget * COMMISSION_RATE;
    }
    const netAmount = finalBudget - commission;

    // 4. Mise à jour des statuts (Livraison et Mission)
    await supabase
      .from("freelance_deliveries")
      .update({ status: "validated" })
      .eq("id", delivery_id);
      
    await supabase
      .from("freelance_missions")
      .update({ status: "completed" })
      .eq("id", delivery.mission_id);

    // 5. Libérer les fonds (avec commission déduite)
    // NOTE: Votre fonction RPC doit exister dans Supabase pour que cela fonctionne.
    const { error: walletError } = await supabase.rpc("increment_wallet_balance", {
      user_id: delivery.seller_id,
      amount: netAmount // ⬅️ Montant Net
    });

    if (walletError) throw walletError;

    // 6. Enregistrement de la transaction (Débit du système, Crédit au vendeur)
    await supabase.from("transactions").insert({
        user_id: delivery.seller_id,
        amount: netAmount,
        currency: 'XOF', // Exemple
        description: `Paiement pour mission ${delivery.mission_id}`,
        status: 'approved',
        provider: 'internal_transfer',
    });


    return res.json({ 
        message: "Livraison validée ✅ et paiement libéré",
        commission_deduite: commission,
        montant_net: netAmount
    });
  } catch (err) {
    console.error("Validate delivery error:", err);
    return res.status(500).json({ error: "Erreur serveur lors de la validation et du transfert de fonds.", details: err.message || err });
  }
}
