// src/controllers/freelanceController.js

import { supabase } from "../server.js";
import { addLog } from "./logController.js"; 

// Commission : Taux de commission par défaut pour la plateforme
const COMMISSION_RATE = 0.10; // 10%

// ========================
// ✅ 1. Créer une mission freelance (côté acheteur)
// (Code inchangé)
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
// (Code inchangé)
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
// 🛑 3. Attribuer un vendeur (côté ACHETEUR) - AVEC ESCROW
// ========================
export async function assignSellerToMission(req, res) {
    const current_user_id = req.user.db.id;
    const { mission_id, application_id } = req.body;

    // 1. Récupérer les détails de la mission ET de la candidature
    const { data: appData, error: fetchError } = await supabase
        .from("freelance_applications")
        .select(`
            seller_id, 
            proposed_price, 
            mission:mission_id (buyer_id, budget, status)
        `)
        .eq("id", application_id)
        .eq("mission_id", mission_id)
        .single();
    
    if (fetchError || !appData || !appData.mission) {
        return res.status(404).json({ error: "Mission ou Candidature introuvable." });
    }

    const { mission, seller_id: assignedSellerId, proposed_price: finalPrice } = appData;
    const buyer_id = mission.buyer_id;
    const mission_budget = mission.budget;

    // 2. Vérifications de sécurité et de statut
    if (buyer_id !== current_user_id) {
        return res.status(403).json({ message: "Accès refusé. Vous n'êtes pas le propriétaire de la mission." });
    }
    if (mission.status !== 'open') {
        return res.status(400).json({ message: "La mission n'est plus ouverte à l'attribution." });
    }

    // Démarrage d'une transaction de base de données pour l'atomicité de l'Escrow
    await supabase.rpc('start_transaction'); 
    
    try {
        // --- 🔒 ÉTAPE 1 : Débit du portefeuille de l'Acheteur (ESCROW) ---
        // Le montant à débiter est le budget initial (mission.budget) ou le proposed_price.
        // Utilisons le proposed_price comme montant final séquestré.
        const { data: walletUpdate, error: walletError } = await supabase.rpc('create_escrow_transaction', {
            p_user_id: buyer_id, 
            p_amount: finalPrice, 
            p_description: `Escrow for Mission: ${mission_id}`
        });

        if (walletError || !walletUpdate || walletUpdate.status !== 'approved') {
            await supabase.rpc('rollback_transaction');
            return res.status(400).json({ message: "Échec du séquestre des fonds. Le solde de l'acheteur est insuffisant ou une erreur de transaction est survenue." });
        }
        
        const escrowTransactionId = walletUpdate.transaction_id;

        // --- 🚀 ÉTAPE 2 : Attribution de la mission et mise à jour ---
        const { data: updatedMission, error: updateError } = await supabase
            .from('freelance_missions')
            .update({
                seller_id: assignedSellerId, // Utilisation de seller_id (colonne du schéma)
                final_price: finalPrice,
                status: 'in_progress', 
                escrow_transaction_id: escrowTransactionId // L'ID de la transaction de séquestre
            })
            .eq('id', mission_id)
            .select("id, status, seller_id")
            .single();

        if (updateError) {
            await supabase.rpc('rollback_transaction');
            return res.status(500).json({ message: "Erreur lors de l'attribution de la mission." });
        }

        // Si tout est bon
        await supabase.rpc('commit_transaction');
        await addLog(buyer_id, 'MISSION_ASSIGNED_ESCROWED', { mission_id, assigned_seller_id: assignedSellerId, escrow_id: escrowTransactionId });

        return res.status(200).json({ 
            message: 'Vendeur attribué et fonds séquestrés ✅', 
            mission: updatedMission
        });

    } catch (e) {
        // En cas d'exception non gérée, on annule tout
        await supabase.rpc('rollback_transaction');
        console.error("Erreur Escrow/Attribution Mission:", e);
        return res.status(500).json({ message: 'Erreur interne du serveur lors de la transaction Escrow.' });
    }
}

// ========================
// ✅ 4. Livraison finale par le VENDEUR
// (Le code a été adapté pour utiliser 'seller_id' qui est le nom de colonne correct)
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
        .select("id, status, seller_id") // Utilisation de seller_id (nom de colonne correct)
        .eq("id", mission_id)
        .single();
        
    if (missionError || !mission) return res.status(404).json({ error: "Mission introuvable." });
    if (mission.seller_id !== seller_id) return res.status(403).json({ error: "Vous n'êtes pas le vendeur assigné à cette mission." });
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
// (Le code a été conservé tel quel, car il gère l'application de la commission)
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
        mission:mission_id (buyer_id, final_price, status, escrow_transaction_id), 
        seller:seller_id (is_commission_exempt) 
      `)
      .eq("id", delivery_id)
      .single();

    if (fetchError || !delivery) {
      return res.status(404).json({ error: "Livraison introuvable" });
    }
    
    // NOTE CRITIQUE : Libération de l'Escrow non implémentée ici (complexité RPC). 
    // On suppose que le crédit au vendeur (point 5) est l'étape de libération.

    // 2. Vérification d'autorisation (acheteur, statut)
    if (delivery.mission.buyer_id !== buyer_id) {
      return res.status(403).json({ error: "Accès refusé. Vous n'êtes pas l'acheteur de cette mission." });
    }
    if (delivery.status !== 'delivered' || delivery.mission.status !== 'awaiting_validation') {
      return res.status(400).json({ error: "La livraison n'est pas en attente de validation." });
    }
    
    // 3. Calcul du montant
    const finalPrice = delivery.mission.final_price; 
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
      user_id_param: delivery.seller_id, 
      amount_param: netAmount
    });

    if (walletError) throw walletError;

    // 6. Enregistrement des transactions (si les tables existent, sinon utiliser les logs)
    // NOTE: On suppose que ces tables (wallet_transactions, commissions) sont gérées soit par le RPC,
    // soit sont des tables de logs supplémentaires non incluses dans le schéma initial.
    
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
      
