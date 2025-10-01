import { supabase } from "../server.js";
import fetch from "node-fetch";

export async function createPayment({ montant, devise, description }) {
  // 🔑 Récupérer fournisseur actif
  const { data: providers, error } = await supabase
    .from("fournisseurs_de_paiement")
    .select("*")
    .eq("est_actif", true)
    .limit(1);

  if (error) throw new Error("Erreur récupération fournisseur: " + error.message);
  if (!providers || providers.length === 0) {
    throw new Error("Aucun fournisseur de paiement actif trouvé");
  }

  const provider = providers[0];

  if (provider.nom.toLowerCase() === "fedapay") {
    return await initFedapay(provider, { montant, devise, description });
  } else {
    throw new Error(`Fournisseur non supporté: ${provider.nom}`);
  }
}

async function initFedapay(provider, { montant, devise, description }) {
  const FEDAPAY_API = "https://api.fedapay.com/v1/transactions";

  const body = {
    amount: montant,
    currency: devise || "XOF",
    description: description || "Paiement marketplace",
    callback_url: "https://ton-backend.com/api/payments/callback",
    cancel_url: "https://ton-frontend.com/cancel",
    return_url: "https://ton-frontend.com/success",
  };

  const response = await fetch(FEDAPAY_API, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${provider.clé_secrète}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error("Erreur Fedapay: " + error);
  }

  return await response.json();
}
