// controllers/paymentProviderController.js

import { supabase } from "../server.js";

// Utility function to check if the user is authorized (Super Admin check)
// This is redundant if 'requireSuperAdmin' is in the router, but serves as a fail-safe.
const isAuthorized = (user) => user && user.db.is_super_admin;


// ========================
// ✅ 1. CREATE : Ajouter un provider (ADMIN)
// ========================
export async function createProvider(req, res) {
  try {
    // Utilisation de la vérification basée sur le modèle de données de req.user
    if (!isAuthorized(req.user)) { 
      return res.status(403).json({ error: "Accès refusé. Rôle Super Admin requis." });
    }

    const { name, public_key, secret_key, is_active } = req.body;
    if (!name || !public_key || !secret_key) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }

    // Si is_active = true, désactiver les autres providers actifs
    if (is_active === true) {
      // NOTE: Le `neq("name", name)` est critique pour éviter de désactiver la ligne qu'on est en train d'insérer,
      // MAIS un simple update({is_active: false}) global est plus sûr si le nom n'existe pas encore.
      await supabase.from("payment_providers").update({ is_active: false }).eq("is_active", true);
    }

    const { data: provider, error } = await supabase
      .from("payment_providers")
      // Assurez-vous que les colonnes 'name', 'public_key', 'secret_key' existent
      .insert([{ name, public_key, secret_key, is_active: is_active || false }])
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({ message: "Provider ajouté ✅", provider });
  } catch (err) {
    console.error("Create provider error:", err);
    return res.status(500).json({ error: "Erreur serveur lors de la création du provider.", details: err.message });
  }
}

// ========================
// ✅ 2. READ ALL : Lister tous les providers (ADMIN)
// ========================
export async function getAllProviders(req, res) {
  try {
    if (!isAuthorized(req.user)) {
      return res.status(403).json({ error: "Accès refusé. Rôle Super Admin requis." });
    }

    // Récupère toutes les colonnes pour l'Admin
    const { data, error } = await supabase.from("payment_providers").select("*").order("created_at", { ascending: false });

    if (error) throw error;
    return res.json({ providers: data });
  } catch (err) {
    console.error("Get all providers error:", err);
    return res.status(500).json({ error: "Erreur serveur lors de la récupération des providers.", details: err.message });
  }
}

// ========================
// ✅ 3. READ ACTIVE : Récupérer le provider actif (PUBLIC)
// ========================
export async function getActiveProvider(req, res) {
  try {
    const { data: provider, error } = await supabase
      .from("payment_providers")
      // Ne retourner que les clés publiques pour la sécurité
      .select("id, name, public_key")
      .eq("is_active", true)
      .single();

    if (error || !provider) {
      return res.status(404).json({ error: "Aucun provider actif n'est configuré." });
    }

    return res.json({ provider });
  } catch (err) {
    console.error("Get active provider error:", err);
    return res.status(500).json({ error: "Erreur serveur lors de la récupération du provider actif.", details: err.message });
  }
}

// ========================
// ✅ 4. UPDATE : Modifier un provider (ADMIN)
// ========================
export async function updateProvider(req, res) {
  try {
    if (!isAuthorized(req.user)) {
      return res.status(403).json({ error: "Accès refusé. Rôle Super Admin requis." });
    }

    const { id } = req.params;
    const updatePayload = req.body;

    // Si on active ce provider, on désactive les autres
    if (updatePayload.is_active === true) {
      await supabase.from("payment_providers").update({ is_active: false }).neq("id", id);
    }

    const { data: updated, error } = await supabase
      .from("payment_providers")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return res.json({ message: "Provider mis à jour ✅", provider: updated });
  } catch (err) {
    console.error("Update provider error:", err);
    return res.status(500).json({ error: "Erreur serveur lors de la mise à jour du provider.", details: err.message });
  }
}

// ========================
// ✅ 5. DELETE : Supprimer un provider (ADMIN)
// ========================
export async function deleteProvider(req, res) {
  try {
    if (!isAuthorized(req.user)) {
      return res.status(403).json({ error: "Accès refusé. Rôle Super Admin requis." });
    }

    const { id } = req.params;
    const { error } = await supabase.from("payment_providers").delete().eq("id", id);

    if (error) throw error;
    return res.json({ message: "Provider supprimé ✅" });
  } catch (err) {
    console.error("Delete provider error:", err);
    return res.status(500).json({ error: "Erreur serveur lors de la suppression du provider.", details: err.message });
  }
}
