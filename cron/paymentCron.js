// cron/paymentCron.js
import cron from "node-cron";
import { supabase } from "../server.js";

// ⚡ Cron : Vérifie les paiements en attente toutes les 5 minutes
export function startPaymentCron() {
  cron.schedule("*/5 * * * *", async () => {
    console.log("⏳ Vérification des paiements en attente...");

    const { data: pendingPayments, error } = await supabase
      .from("payments")
      .select("id, created_at")
      .eq("status", "pending");

    if (error) {
      console.error("Erreur récupération paiements:", error);
      return;
    }

    const now = new Date();

    for (const payment of pendingPayments) {
      const createdAt = new Date(payment.created_at);
      const diffMinutes = Math.floor((now - createdAt) / (1000 * 60));

      if (diffMinutes > 30) {
        // ❌ Expiration
        const { error: updateError } = await supabase
          .from("payments")
          .update({ status: "failed" })
          .eq("id", payment.id);

        if (updateError) {
          console.error(`Erreur maj paiement ${payment.id}:`, updateError);
        } else {
          console.log(`💸 Paiement ${payment.id} expiré et marqué comme échoué.`);
        }
      }
    }
  });
}
