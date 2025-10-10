// src/controllers/paymentProviderController.js (FINALISÉ)

import { supabase } from "../server.js";
import { addLog } from "./logController.js"; 

// Utility function to check if the user is authorized (Super Admin check)
const isAuthorized = (user) => user && user.db.is_super_admin;


// ========================
// ✅ 1. CREATE : Ajouter un provider (ADMIN)
// ========================
export async function createProvider(req, res) {
  try {
    if (!isAuthorized(req.user)) { 
      return res.status(403).json({ error: "Accès refusé. Rôle Super Admin requis." });
    }

    const { name, public_key, secret_key, is_active } = req.body;
    if (!name || !public_key || !secret_key) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }

    // ⚠️ CRITIQUE : Si on active ce provider, désactiver TOUS les autres actifs
    if (is_active === true) {
      const { error: deactivateError } = await supabase
        .from("payment_providers")
        .update({ is_active: false })
        .eq("is_active", true); // Désactive tous les providers actuellement actifs
        
      if (deactivateError) throw deactivateError;
    }

    const { data: provider, error } = await supabase
      .from("payment_providers")
      .insert([{ name, public_key, secret_key, is_active: is_active || false }])
      .select()
      .single();

    if (error) throw error;
    
    await addLog(req.user.db.id, 'PAYMENT_PROVIDER_CREATED', { name: provider.name, id: provider.id, is_active: provider.is_active });

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
      // Ne retourner que les clés publiques et le nom pour la sécurité
      .select("id, name, public_key")
      .eq("is_active", true)
      .limit(1) // ⬅️ S'assurer qu'un seul est retourné
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

    // ⚠️ CRITIQUE : Si on active ce provider, désactiver les autres
    if (updatePayload.is_active === true) {
      const { error: deactivateError } = await supabase
        .from("payment_providers")
        .update({ is_active: false })
        .neq("id", id); // Désactive tous les autres (sauf celui-ci)
        
      if (deactivateError) throw deactivateError;
    }

    const { data: updated, error } = await supabase
      .from("payment_providers")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    
    await addLog(req.user.db.id, 'PAYMENT_PROVIDER_UPDATED', { id: updated.id, name: updated.name, is_active: updated.is_active });

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
    
    // Récupérer le nom pour le log
    const { data: deletedProvider } = await supabase.from("payment_providers").select("name").eq("id", id).single();
    
    const { error } = await supabase.from("payment_providers").delete().eq("id", id);

    if (error) throw error;
    
    await addLog(req.user.db.id, 'PAYMENT_PROVIDER_DELETED', { id, name: deletedProvider?.name });
    
    return res.json({ message: "Provider supprimé ✅" });
  } catch (err) {
    console.error("Delete provider error:", err);
    return res.status(500).json({ error: "Erreur serveur lors de la suppression du provider.", details: err.message });
  }
}
