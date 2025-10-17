// src/controllers/freelanceController.js

import { supabase } from "../server.js";
import { addLog } from "./logController.js"; 
import fedapayService from '../services/fedapayService.js'; 

// NOTE : La commission est désormais gérée uniquement et de manière centralisée
// dans src/services/fedapayService.js. Nous n'avons plus besoin de COMMISSION_RATE ici.

// ========================
// 1. Créer une mission freelance (côté acheteur)
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
// 2. Postuler à une mission (côté VENDEUR)
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
// 3. Accepter Candidature & Initier Escrow (côté ACHETEUR)
// Anciennement 'assignSellerToMission' et 'acceptFreelanceApplication'
// ========================
/**
 * Gère l'acceptation d'une candidature par l'acheteur et l'initialisation du paiement Escrow (Fedapay).
 */
export async function acceptFreelanceApplication(req, res) {
    try {
        const buyer_id = req.user.db.id; 
        const { application_id } = req.body;

        if (!application_id) {
             return res.status(400).json({ error: "L'ID de la candidature est manquant." });
        }

        // 1. Récupérer l'application et valider les droits
        const { data: application, error: appError } = await supabase
            .from('freelance_applications')
            .select('mission_id, seller_id, proposed_price, mission:freelance_missions(buyer_id, status)')
            .eq('id', application_id)
            .single();
        
        if (appError || !application || application.mission.buyer_id !== buyer_id || application.mission.status !== 'open') {
             return res.status(403).json({ error: "Accès refusé, candidature introuvable ou mission déjà attribuée." });
        }

        const mission_id = application.mission_id;
        const seller_id = application.seller_id;
        const final_price = application.proposed_price;

        // 2. Mettre à jour la mission : statut en attente de paiement
        await supabase.from('freelance_missions')
            .update({ 
                seller_id: seller_id, 
                final_price: final_price,
                status: 'pending_payment' // Statut critique pour l'Escrow
            })
            .eq('id', mission_id);

        // 3. Création de la transaction interne (pour le séquestre - sera liée par le webhook)
        const { data: transaction, error: transactionError } = await supabase.from("transactions").insert({
            user_id: buyer_id,
            provider: 'fedapay',
            amount: final_price,
            status: "pending",
            description: `Initiation Escrow pour mission #${mission_id}`,
        }).select('id').single();

        if (transactionError || !transaction) throw new Error("Échec de la création de la transaction interne d'Escrow.");


        // 4. Appel au service FedaPay pour créer le lien d'Escrow
        // Récupérer la clé secrète dynamique
        const { data: provider, error: providerError } = await supabase
            .from("payment_providers")
            .select("secret_key, public_key")
            .eq("name", "fedapay")
            .eq("is_active", true)
            .single();
            
        if (providerError || !provider) {
             throw new Error("Le fournisseur de paiement FedaPay n'est pas actif.");
        }
            
        const env = process.env.NODE_ENV === 'production' ? 'live' : 'sandbox';
            
        const redirect_url = await fedapayService.createMissionEscrowLink(
            provider.secret_key, 
            env,
            final_price,
            mission_id,
            buyer_id
        );

        await addLog(buyer_id, 'APPLICATION_ACCEPTED_ESCROW_INIT', { mission_id, seller_id, transaction_id: transaction.id });

        return res.json({
            message: "Candidature acceptée. Redirection vers la sécurisation des fonds (Escrow). ✅",
            checkout_url: redirect_url,
            public_key: provider.public_key 
        });


    } catch (err) {
        console.error("Erreur acceptation candidature freelance/init Escrow:", err.message);
        // En cas d'échec, remettre la mission à 'open'
        // Nous utilisons mission_id pour le rollback si le corps de la requête est perdu
        if (mission_id) {
           await supabase.from('freelance_missions').update({ status: 'open', seller_id: null, final_price: null }).eq('id', mission_id);
        }
        res.status(500).json({ error: "Échec de l'initialisation de l'Escrow.", details: err.message });
    }
}


// ========================
// 4. Livraison finale par le VENDEUR
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
    // Doit être 'in_progress' (statut donné par le Webhook Fedapay après paiement réussi)
    if (mission.status !== 'in_progress') return res.status(400).json({ error: "La mission n'est pas en cours de réalisation (fonds non séquestrés)." });


    // 2. Créer l'enregistrement de la livraison
    const { data: delivery, error } = await supabase
      .from("freelance_deliveries")
      .insert([{
        mission_id,
        seller_id,
        delivery_note,
        file_url,
        // Le prix final est pris sur la mission, mais on le stocke ici pour l'historique
        final_price: mission.final_price, 
        status: "delivered"
      }])
      .select()
      .single();

    if (error) throw error;

    // 3. Mettre à jour le statut de la mission
    await supabase.from("freelance_missions").update({ status: "awaiting_validation" }).eq("id", mission_id);
    
    await addLog(seller_id, 'MISSION_DELIVERED', { mission_id, delivery_id: delivery.id });


    return res.status(201).json({ message: "Travail livré et en attente de validation ✅", delivery });
  } catch (err) {
    console.error("Deliver work error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message || err });
  }
}


// ========================
// 5. Validation par l’acheteur & Déblocage Escrow (côté ACHETEUR)
// Anciennement 'validateDelivery' et 'validateMissionDelivery'
// ========================
/**
 * Gère la validation d'une livraison de mission par l'acheteur et le déblocage des fonds Escrow.
 */
export async function validateMissionDelivery(req, res) {
    try {
        const buyer_id = req.user.db.id; 
        const { delivery_id } = req.body;

        if (!delivery_id) {
            return res.status(400).json({ error: "L'ID de la livraison est manquant." });
        }

        // 1. Récupérer la livraison et les infos critiques (mission, escrow)
        const { data: delivery, error: deliveryError } = await supabase
            .from('freelance_deliveries')
            .select('mission_id, seller_id, final_price, status, mission:mission_id(buyer_id, escrow_transaction_id, status)')
            .eq('id', delivery_id)
            .single();

        if (deliveryError || !delivery || delivery.status !== 'delivered') {
            return res.status(400).json({ error: "Livraison introuvable ou non prête à être validée." });
        }
        
        // 2. Vérifications de sécurité et de statut
        const mission = delivery.mission;
        if (mission.buyer_id !== buyer_id) {
            return res.status(403).json({ error: "Accès refusé. Vous n'êtes pas l'acheteur de cette mission." });
        }
        if (mission.status !== 'awaiting_validation' || !mission.escrow_transaction_id) {
             return res.status(400).json({ error: "Mission non valide, ou fonds non séquestrés. Statut actuel: " + mission.status });
        }
        
        // 3. Déblocage des fonds via le service (Création Commission + Crédit Portefeuille)
        // Ceci utilise la transaction interne Escrow_transaction_id comme référence.
        const totalCommission = await fedapayService.releaseEscrowFunds(
            delivery.mission_id,
            mission.escrow_transaction_id, // ID de la transaction INTERNE du séquestre
            delivery.seller_id,
            delivery.final_price // Montant final (séquestré)
        );
        
        // 4. Mettre à jour la livraison et la mission
        // C'est la dernière étape du flux
        await supabase
            .from('freelance_deliveries')
            .update({ status: 'validated' })
            .eq('id', delivery_id);

        await supabase
            .from('freelance_missions')
            .update({ status: 'completed' })
            .eq('id', delivery.mission_id);


        await addLog(buyer_id, 'ESCROW_RELEASED', { 
            mission_id: delivery.mission_id, 
            commission: totalCommission,
            amount_paid: delivery.final_price
        });
        
        return res.json({ message: "Livraison validée et paiement débloqué avec succès. ✅" });

    } catch (err) {
        console.error("Erreur lors de la validation de la livraison et du déblocage Escrow:", err.message);
        res.status(500).json({ error: "Échec du déblocage de l'Escrow.", details: err.message });
    }
      }
              
