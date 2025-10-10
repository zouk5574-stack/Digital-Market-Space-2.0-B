// src/controllers/freelanceController.js

import { supabase } from "../server.js";
import { addLog } from "./logController.js"; 

// Commission : Taux de commission par défaut pour la plateforme
const COMMISSION_RATE = 0.10; // 10%

// ========================
// ✅ 1. Créer une mission freelance (côté acheteur)
// ========================
export async function createFreelanceMission(req, res) {
  try {
    const buyer_id = req.user.db.id;
    const { title, description, budget, deadline, category } = req.body;

    if (!title || !description || !budget) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }
    if (parseFloat(budget) <= 0) {
       return res.status(400).json({ error: "Le budget doit être un montant positif." });
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
    
    await addLog(buyer_id, 'MISSION_CREATED', { mission_id: mission.id, budget: mission.budget });

    return res.status(201).json({ message: "Mission créée ✅", mission });
  } catch (err) {
    console.error("Create freelance mission error:", err);
    return res.status(500).json({ error: "Erreur serveur lors de la création de la mission.", details: err.message || err });
  }
}

// ========================
// ✅ 2. Postuler à une mission (côté VENDEUR)
// ========================
export async function applyToMission(req, res) {
  try {
    const seller_id = req.user.db.id; 
    const { mission_id, proposal, proposed_price } = req.body;

    if (!mission_id || !proposal || !proposed_price) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }

    const { data: application, error } = await supabase
      .from("freelance_applications")
      .insert([{
        mission_id,
        seller_id, 
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
    
    await addLog(seller_id, 'MISSION_APPLIED', { mission_id, application_id: application.id, proposed_price: application.proposed_price });

    return res.status(201).json({ message: "Candidature envoyée ✅", application });
  } catch (err) {
    console.error("Apply to mission error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message || err });
  }
}


// ========================
// 🛑 3. Attribuer un vendeur (côté ACHETEUR)
// ========================
export async function assignSellerToMission(req, res) {
    const buyer_id = req.user.db.id;
    const { mission_id, application_id } = req.body;

    // ⚠️ CRITIQUE : C'est ici que l'acheteur devrait être pré-débité/séquestré
    
    try {
        // 1. Vérifier la mission et la propriété
        const { data: mission, error: missionError } = await supabase
            .from("freelance_missions")
            .select("id, buyer_id, status")
            .eq("id", mission_id)
            .single();

        if (missionError || !mission) return res.status(404).json({ error: "Mission introuvable." });
        if (mission.buyer_id !== buyer_id) return res.status(403).json({ error: "Accès refusé. Vous n'êtes pas le propriétaire." });
        if (mission.status !== 'open') return res.status(400).json({ error: "La mission n'est plus ouverte aux candidatures." });
        
        // 2. Récupérer la candidature pour obtenir l'ID du vendeur et le prix
        const { data: application, error: appError } = await supabase
            .from("freelance_applications")
            .select("seller_id, proposed_price")
            .eq("id", application_id)
            .eq("mission_id", mission_id)
            .single();

        if (appError || !application) return res.status(404).json({ error: "Candidature introuvable." });


        // 3. Mise à jour de la mission : attribution et statut
        const { data: updatedMission, error: updateError } = await supabase
            .from("freelance_missions")
            .update({
                assigned_seller_id: application.seller_id,
                final_price: application.proposed_price, // ⬅️ Utilisation du prix proposé
                status: "in_progress" 
            })
            .eq("id", mission_id)
            .select("id, status, assigned_seller_id")
            .single();

        if (updateError) throw updateError;
        
        await addLog(buyer_id, 'MISSION_ASSIGNED', { mission_id, assigned_seller_id: application.seller_id });

        return res.json({ message: "Vendeur assigné et mission lancée ✅", mission: updatedMission });
    } catch (err) {
        console.error("Assign seller error:", err);
        return res.status(500).json({ error: "Erreur serveur lors de l'attribution.", details: err.message || err });
    }
}


// ========================
// ✅ 4. Livraison finale par le VENDEUR
// ========================
export async function deliverWork(req, res) {
  try {
    const seller_id = req.user.db.id;
    const { mission_id, delivery_note, file_url } = req.body;

    if (!mission_id || !delivery_note) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }

    // 1. Vérifier que ce vendeur est le vendeur ATTRIBUÉ
    const { data: mission, error: missionError } = await supabase
        .from("freelance_missions")
        .select("id, status, assigned_seller_id")
        .eq("id", mission_id)
        .single();
        
    if (missionError || !mission) return res.status(404).json({ error: "Mission introuvable." });
    if (mission.assigned_seller_id !== seller_id) return res.status(403).json({ error: "Vous n'êtes pas le vendeur assigné à cette mission." });
    if (mission.status !== 'in_progress') return res.status(400).json({ error: "La mission n'est pas en cours." });


    // 2. Créer l'enregistrement de la livraison
    const { data: delivery, error } = await supabase
      .from("freelance_deliveries")
      .insert([{
        mission_id,
        seller_id,
        delivery_note,
        file_url,
        status: "delivered"
      }])
      .select()
      .single();

    if (error) throw error;

    // 3. Mettre à jour le statut de la mission à 'awaiting_validation'
    await supabase.from("freelance_missions").update({ status: "awaiting_validation" }).eq("id", mission_id);
    
    await addLog(seller_id, 'MISSION_DELIVERED', { mission_id, delivery_id: delivery.id });


    return res.status(201).json({ message: "Travail livré et en attente de validation ✅", delivery });
  } catch (err) {
    console.error("Deliver work error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message || err });
  }
}

// ========================
// ✅ 5. Validation par l’acheteur (avec gestion commission)
// ========================
export async function validateDelivery(req, res) {
  // NOTE: Dans un environnement réel, toutes ces étapes (DB, wallet) seraient dans une SEULE transaction
  // (ex: Stored Procedure PostgreSQL) pour garantir l'atomicité.

  try {
    const buyer_id = req.user.db.id;
    const { delivery_id } = req.body;

    // 1. Récupérer les données critiques (mission, vendeur, prix final)
    const { data: delivery, error: fetchError } = await supabase
      .from("freelance_deliveries")
      .select(`
        mission_id, 
        seller_id, 
        status, 
        mission:mission_id (buyer_id, final_price, status), 
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
    if (delivery.status !== 'delivered' || delivery.mission.status !== 'awaiting_validation') {
      return res.status(400).json({ error: "La livraison n'est pas en attente de validation." });
    }
    
    // 3. Calcul du montant
    const finalPrice = delivery.mission.final_price; // ⬅️ Utilisation du final_price
    let commission = 0;
    
    // Application de la commission
    if (!delivery.seller.is_commission_exempt) {
        commission = finalPrice * COMMISSION_RATE;
    }
    const netAmount = finalPrice - commission;

    // 4. Mise à jour des statuts (Livraison et Mission)
    await supabase
      .from("freelance_deliveries")
      .update({ status: "validated" })
      .eq("id", delivery_id);
      
    await supabase
      .from("freelance_missions")
      .update({ status: "completed", payment_released: true })
      .eq("id", delivery.mission_id);

    // 5. Libérer les fonds (Crédit au vendeur via RPC)
    const { error: walletError } = await supabase.rpc("increment_wallet_balance", {
      user_id_param: delivery.seller_id, // ⬅️ Correction: Utilisation de _param si votre RPC l'exige
      amount_param: netAmount
    });

    if (walletError) throw walletError;

    // 6. Enregistrement de la transaction de CREDIT dans le portefeuille du VENDEUR
    await supabase.from("wallet_transactions").insert({
        user_id: delivery.seller_id,
        amount: netAmount,
        description: `Crédit paiement mission #${delivery.mission_id}`,
        type: 'credit',
        status: 'completed',
    });
    
    // 7. Enregistrement de la COMMISSION de la plateforme
    await supabase.from("commissions").insert({
        mission_id: delivery.mission_id,
        seller_id: delivery.seller_id,
        amount: commission,
        rate: COMMISSION_RATE
    });
    
    await addLog(buyer_id, 'MISSION_VALIDATED_PAID', { mission_id: delivery.mission_id, amount: finalPrice });

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
    
