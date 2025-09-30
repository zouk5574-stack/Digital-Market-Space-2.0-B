import { supabase } from "../server.js";

// ✅ Admin : définir ou mettre à jour les clés Fedapay
export async function setFedapayKeys(req, res) {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Accès interdit 🚫" });
    }

    const { public_key, secret_key } = req.body;

    if (!public_key || !secret_key) {
      return res.status(400).json({ error: "Clés Fedapay manquantes" });
    }

    const { error } = await supabase
      .from("payment_providers")
      .upsert([
        {
          provider: "fedapay",
          public_key,
          secret_key,
          updated_at: new Date().toISOString(),
        },
      ], { onConflict: "provider" });

    if (error) throw error;

    return res.json({ message: "Clés Fedapay mises à jour ✅" });
  } catch (err) {
    console.error("Set Fedapay keys error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
}

// ✅ Admin : récupérer les clés (sécurité → seulement admin)
export async function getFedapayKeys(req, res) {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Accès interdit 🚫" });
    }

    const { data, error } = await supabase
      .from("payment_providers")
      .select("public_key, secret_key")
      .eq("provider", "fedapay")
      .single();

    if (error) throw error;

    return res.json({ fedapay: data });
  } catch (err) {
    console.error("Get Fedapay keys error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
      }
