// src/controllers/paymentProviderController.js (FINALISÉ)

import { supabase } from "../server.js";
import { addLog } from "./logController.js"; 

// ✅ Admin : définir ou mettre à jour les clés Fedapay
export async function setFedapayKeys(req, res) {
  try {
    // ⚠️ CRITIQUE : Vérification de l'Admin Unique (Super Admin)
    if (!req.user.db.is_super_admin) {
      return res.status(403).json({ error: "Accès interdit 🚫. Seul l'Administrateur peut modifier les clés." });
    }

    const { public_key, secret_key } = req.body;

    if (!public_key || !secret_key) {
      return res.status(400).json({ error: "Clés Fedapay manquantes" });
    }
    
    // 1. Mise à jour ou insertion
    const { error } = await supabase
      .from("payment_providers")
      .upsert([
        {
          // ➡️ COHÉRENCE : Utilisation de 'name' comme clé primaire
          name: "fedapay",
          public_key,
          secret_key,
          is_active: true, // On présuppose que si les clés sont fournies, le provider est actif
          updated_at: new Date().toISOString(),
        },
      ], { onConflict: "name" }); // ⬅️ OnConflict sur 'name'

    if (error) throw error;
    
    // 2. Log de l'action sensible
    await addLog(req.user.db.id, 'PAYMENT_KEYS_UPDATED', { provider: 'fedapay', public_key_preview: public_key.substring(0, 10) + '...' });


    return res.json({ message: "Clés Fedapay mises à jour ✅" });
  } catch (err) {
    console.error("Set Fedapay keys error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
}

// ✅ Admin : récupérer les clés (sécurité → seulement admin)
export async function getFedapayKeys(req, res) {
  try {
    // ⚠️ CRITIQUE : Vérification de l'Admin Unique (Super Admin)
    if (!req.user.db.is_super_admin) {
      return res.status(403).json({ error: "Accès interdit 🚫" });
    }

    const { data, error } = await supabase
      .from("payment_providers")
      .select("public_key, secret_key, is_active")
      // ➡️ COHÉRENCE : Utilisation de 'name'
      .eq("name", "fedapay") 
      .single();

    if (error) throw error;

    return res.json({ fedapay: data });
  } catch (err) {
    console.error("Get Fedapay keys error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
}
