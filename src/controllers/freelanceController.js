// src/controllers/freelanceController.js

import { supabase } from "../server.js";
import { addLog } from "./logController.js"; 
import fedapayService from '../services/fedapayService.js'; // 🥂 NOUVEL IMPORT

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
// ✅ 3. Attribuer un vendeur (côté ACHETEUR) - INITIATION PAIEMENT FEDAPAY
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
            mission:mission_id (buyer_id, status, title) 
        `)
        .eq("id", application_id)
        .eq("mission_id", mission_id)
        .single();
    
    if (fetchError || !appData || !appData.mission) {
        return res.status(404).json({ error: "Mission ou Candidature introuvable." });
    }

    const { mission, seller_id: assignedSellerId, proposed_price: finalPrice } = appData;
    const buyer_id = mission.buyer_id;

    // 2. Vérifications de sécurité et de statut
    if (buyer_id !== current_user_id) {
        return res.status(403).json({ message: "Accès refusé. Vous n'êtes pas le propriétaire de la mission." });
    }
    if (mission.status !== 'open') {
        return res.status(400).json({ message: "La mission n'est plus ouverte à l'attribution." });
    }

    // 3. Récupérer la Clé Secrète de la DB
    const { data: provider, error: providerError } = await supabase
        .from("payment_providers")
        .select("secret_key")
        .eq("name", "fedapay")
        .eq("is_active", true)
        .single();

    if (providerError || !provider) {
          return res.status(503).json({ error: "Le fournisseur de paiement Fedapay n'est pas actif. Contactez l'administrateur." });
    }
    
    const env = process.env.NODE_ENV === 'production' ? 'live' : 'sandbox';
    
    // 🛑 Supprime le bloc de transaction RPC local au profit de l'appel FedaPay
    
    try {
        
        // 4. Mise à jour préliminaire de la mission à 'pending_payment'
        // Le webhook mettra à jour à 'in_progress' après paiement
        const { error: updateError } = await supabase
            .from('freelance_missions')
            .update({
                seller_id: assignedSellerId,
                final_price: finalPrice,
                status: 'pending_payment', // En attente de paiement FedaPay
            })
            .eq('id', mission_id);

        if (updateError) throw updateError;
        
        // 5. --- 💳 APPEL AU SERVICE FEDAPAY AVEC CLÉ DYNAMIQUE ---
        const redirect_url = await fedapayService.createEscrowServiceLink(
            provider.secret_key, // Clé secrète de la DB
            env,
            finalPrice, 
            `Paiement Escrow : ${mission.title}`, 
            mission_id,
            buyer_id
        );

        if (!redirect_url) {
             // Rollback de l'attribution si l'initiation échoue
             await supabase.from('freelance_missions').update({ status: 'open', seller_id: null, final_price: null }).eq('id', mission_id);
            return res.status(500).json({ message: "Échec de la connexion à FedaPay ou génération du lien échouée." });
        }

        await addLog(buyer_id, 'MISSION_PAYMENT_INITIATED_FEDAPAY', { mission_id, assigned_seller_id: assignedSellerId, price: finalPrice });

        // 6. Renvoyer l'URL de redirection au Frontend
        return res.status(200).json({ 
            message: 'Redirection vers FedaPay...', 
            redirect_url: redirect_url // URL réelle fournie par le SDK FedaPay
        });

    } catch (e) {
        // En cas d'échec (DB ou FedaPay), on remet la mission en statut 'open'
        await supabase.from('freelance_missions').update({ status: 'open', seller_id: null, final_price: null }).eq('id', mission_id);
        console.error("Erreur critique lors de l'attribution et paiement FedaPay:", e.message);
        return res.status(500).json({ 
            message: 'Erreur interne du serveur lors de la préparation du paiement.', 
            details: e.message 
        });
    }
}

// ========================
// ✅ 4. Livraison finale par le VENDEUR
// (Code inchangé)
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
        .select("id, status, seller_id")
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
// (Code inchangé)
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
    // NOTE: On suppose que c'est ici que l'argent séquestré par Fedapay est transféré au vendeur.
    // Dans un système réel, cela impliquerait un appel à l'API Fedapay pour effectuer un transfert/virement,
    // mais nous simulons le crédit du portefeuille local ici.
    const { error: walletError } = await supabase.rpc("increment_wallet_balance", {
      user_id_param: delivery.seller_id, 
      amount_param: netAmount
    });

    if (walletError) throw walletError;

    // 6. Log
    await addLog(buyer_id, 'MISSION_VALIDATED_PAID', { mission_id: delivery.mission_id, amount: finalPrice, fedapay_escrow_id: delivery.mission.escrow_transaction_id });

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
      
