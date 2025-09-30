// controllers/paymentProviderController.js
import { supabase } from "../server.js";

// ✅ Ajouter un provider
export async function createProvider(req, res) {
  try {
    if (!req.user.is_super_admin) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    const { name, public_key, secret_key, is_active } = req.body;
    if (!name || !public_key || !secret_key) {
      return res.status(400).json({ error: "Champs obligatoires manquants" });
    }

    // Si is_active = true, désactiver les autres
    if (is_active) {
      await supabase.from("payment_providers").update({ is_active: false }).neq("name", name);
    }

    const { data: provider, error } = await supabase
      .from("payment_providers")
      .insert([{ name, public_key, secret_key, is_active }])
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({ message: "Provider ajouté ✅", provider });
  } catch (err) {
    console.error("Create provider error:", err);
    return res.status(500).json({ error: err.message });
  }
}

// ✅ Lister tous les providers (admin seulement)
export async function getAllProviders(req, res) {
  try {
    if (!req.user.is_super_admin) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    const { data, error } = await supabase.from("payment_providers").select("*").order("created_at", { ascending: false });

    if (error) throw error;
    return res.json({ providers: data });
  } catch (err) {
    console.error("Get all providers error:", err);
    return res.status(500).json({ error: err.message });
  }
}

// ✅ Récupérer le provider actif (public)
export async function getActiveProvider(req, res) {
  try {
    const { data: provider, error } = await supabase
      .from("payment_providers")
      .select("id, name, public_key, is_active")
      .eq("is_active", true)
      .single();

    if (error || !provider) {
      return res.status(404).json({ error: "Aucun provider actif" });
    }

    return res.json({ provider });
  } catch (err) {
    console.error("Get active provider error:", err);
    return res.status(500).json({ error: err.message });
  }
}

// ✅ Modifier un provider
export async function updateProvider(req, res) {
  try {
    if (!req.user.is_super_admin) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    const { id } = req.params;
    const { name, public_key, secret_key, is_active } = req.body;

    if (is_active) {
      await supabase.from("payment_providers").update({ is_active: false }).neq("id", id);
    }

    const { data: updated, error } = await supabase
      .from("payment_providers")
      .update({ name, public_key, secret_key, is_active })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return res.json({ message: "Provider mis à jour ✅", provider: updated });
  } catch (err) {
    console.error("Update provider error:", err);
    return res.status(500).json({ error: err.message });
  }
}

// ✅ Supprimer un provider
export async function deleteProvider(req, res) {
  try {
    if (!req.user.is_super_admin) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    const { id } = req.params;
    const { error } = await supabase.from("payment_providers").delete().eq("id", id);

    if (error) throw error;
    return res.json({ message: "Provider supprimé ✅" });
  } catch (err) {
    console.error("Delete provider error:", err);
    return res.status(500).json({ error: err.message });
  }
      }
