// src/cron/withdrawalCron.js (FINALISÉ)

import cron from "node-cron";
import { supabase } from "../server.js";
import { sendNotification } from "../services/notificationService.js";
import { addLog } from "../controllers/logController.js"; // Import pour la traçabilité

// ⚡ Cron : Vérifie les retraits en attente toutes les heures pour l'auto-approbation
export function startWithdrawalCron() {
  // Exécution au début de chaque heure
  cron.schedule("0 * * * *", async () => { 
    console.log("⏳ Vérification des retraits en attente d'auto-approbation...");

    // ➡️ Rétention : Utilisation de la variable d'environnement avec valeur par défaut 
    const autoApproveHours = Number(process.env.WITHDRAWAL_AUTO_APPROVE_HOURS || 48);

    const { data: pendingWithdrawals, error } = await supabase
      .from("withdrawals")
      .select("id, user_id, amount, status, created_at")
      .eq("status", "pending");

    if (error) {
      console.error("Erreur récupération retraits en attente:", error);
      return;
    }

    const now = new Date();

    for (const withdrawal of pendingWithdrawals) {
      const createdAt = new Date(withdrawal.created_at);
      const diffHours = Math.floor((now - createdAt) / (1000 * 60 * 60));

      // Si le retrait dépasse la limite d'heures et n'a pas été traité par un admin
      if (diffHours >= autoApproveHours) {
        
        // 1. Mise à jour du statut (pas de débit ici, le montant a été bloqué à la création)
        const { error: updateError } = await supabase
          .from("withdrawals")
          .update({
            status: "approved",
            auto_approved: true, 
            processed_at: new Date().toISOString(),
            // ID Admin est NULL car c'est auto-traité
          })
          .eq("id", withdrawal.id);

        if (updateError) {
          console.error(`Erreur maj statut ${withdrawal.id}:`, updateError);
          // Log de l'erreur interne
          await addLog(withdrawal.user_id, 'WITHDRAWAL_AUTO_APPROVE_FAILED', { withdrawal_id: withdrawal.id, reason: updateError.message });
          continue;
        }

        console.log(`💸 Retrait ${withdrawal.id} auto-confirmé après ${diffHours} heures ✅`);
        
        // 2. Log de l'action
        await addLog(withdrawal.user_id, 'WITHDRAWAL_AUTO_APPROVED', { withdrawal_id: withdrawal.id, amount: withdrawal.amount });
        
        // 3. Notifier l’utilisateur
        await sendNotification(
          withdrawal.user_id,
          "Retrait validé automatiquement ✅",
          `Ton retrait de ${withdrawal.amount} a été automatiquement approuvé par le système après ${diffHours} heures.`
        );
      }
    }
  });
}
