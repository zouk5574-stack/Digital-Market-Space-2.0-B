import { supabase } from "../server.js";

// ✅ Créer une mission freelance (côté acheteur)
export async function createFreelanceMission(req, res) {
  try {
    const buyerId = req.user.sub;
    const { title, description, budget, deadline, category } = req.body;

    if (!title || !description || !budget) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }

    const { data: mission, error } = await supabase
      .from("freelance_missions")
      .insert([{
        buyer_id: buyerId,
        title,
        description,
        budget,
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
    return res.status(500).json({ error: "Erreur serveur", details: err.message || err });
  }
}

// ✅ Postuler à une mission (côté vendeur)
export async function applyToMission(req, res) {
  try {
    const sellerId = req.user.sub;
    const { mission_id, proposal, proposed_price } = req.body;

    if (!mission_id || !proposal) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }

    const { data: application, error } = await supabase
      .from("freelance_applications")
      .insert([{
        mission_id,
        seller_id: sellerId,
        proposal,
        proposed_price
      }])
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({ message: "Candidature envoyée ✅", application });
  } catch (err) {
    console.error("Apply to mission error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message || err });
  }
}

// ✅ Livraison finale par le vendeur
export async function deliverWork(req, res) {
  try {
    const sellerId = req.user.sub;
    const { mission_id, delivery_note, file_url } = req.body;

    if (!mission_id || !delivery_note) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }

    const { data: delivery, error } = await supabase
      .from("freelance_deliveries")
      .insert([{
        mission_id,
        seller_id: sellerId,
        delivery_note,
        file_url,
        status: "delivered"
      }])
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({ message: "Travail livré ✅", delivery });
  } catch (err) {
    console.error("Deliver work error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message || err });
  }
}

// ✅ Validation par l'acheteur
export async function validateDelivery(req, res) {
  try {
    const buyerId = req.user.sub;
    const { delivery_id } = req.body;

    const { data: delivery, error: fetchError } = await supabase
      .from("freelance_deliveries")
      .select("mission_id, seller_id, status")
      .eq("id", delivery_id)
      .single();

    if (fetchError || !delivery) {
      return res.status(404).json({ error: "Livraison introuvable" });
    }

    // Vérifier que la mission appartient bien à l'acheteur
    const { data: mission, error: missionError } = await supabase
      .from("freelance_missions")
      .select("buyer_id, budget")
      .eq("id", delivery.mission_id)
      .single();

    if (missionError || !mission || mission.buyer_id !== buyerId) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    // Mise à jour du statut livraison
    await supabase
      .from("freelance_deliveries")
      .update({ status: "validated" })
      .eq("id", delivery_id);

    // Libérer les fonds au vendeur
    await supabase.rpc("increment_wallet_balance", {
      user_id: delivery.seller_id,
      amount: mission.budget
    });

    return res.json({ message: "Livraison validée ✅ et paiement libéré" });
  } catch (err) {
    console.error("Validate delivery error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message || err });
  }
      }
