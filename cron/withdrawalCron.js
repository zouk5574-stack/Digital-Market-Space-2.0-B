// cron/withdrawalCron.js
import cron from "node-cron";
import { supabase } from "../server.js";
import { sendNotification } from "../services/notificationService.js";

export function startWithdrawalCron() {
  cron.schedule("*/30 * * * *", async () => {
    console.log("⏳ Vérification des retraits en attente...");

    const autoApproveHours = process.env.WITHDRAWAL_AUTO_APPROVE_HOURS || 48;

    const { data: pendingWithdrawals, error } = await supabase
      .from("withdrawals")
      .select("id, user_id, amount, created_at")
      .eq("status", "pending");

    if (error) {
      console.error("Erreur récupération retraits:", error);
      return;
    }

    const now = new Date();

    for (const withdrawal of pendingWithdrawals) {
      const createdAt = new Date(withdrawal.created_at);
      const diffHours = Math.floor((now - createdAt) / (1000 * 60 * 60));

      if (diffHours >= autoApproveHours) {
        // ✅ Auto-approbation
        const { error: updateError } = await supabase
          .from("withdrawals")
          .update({
            status: "approved",
            auto_approved: true, // champ booléen pour tracer
          })
          .eq("id", withdrawal.id);

        if (updateError) {
          console.error(`Erreur maj retrait ${withdrawal.id}:`, updateError);
          continue;
        }

        // ✅ Débiter le wallet
        const { error: walletError } = await supabase.rpc(
          "decrement_wallet_balance",
          {
            user_id: withdrawal.user_id,
            amount: withdrawal.amount,
          }
        );

        if (walletError) {
          console.error(`Erreur débit wallet pour ${withdrawal.id}:`, walletError);
        } else {
          console.log(`💸 Retrait ${withdrawal.id} auto-confirmé ✅`);

          // ✅ Notifier l’utilisateur
          await sendNotification(
            withdrawal.user_id,
            "Retrait validé ✅",
            `Ton retrait de ${withdrawal.amount} a été automatiquement confirmé.`
          );
        }
      }
    }
  });
}
