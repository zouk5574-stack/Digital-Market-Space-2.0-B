// src/cron/orderCron.js (AMÉLIORÉ)

// ➡️ Cohérence : Utilisation de la bibliothèque 'cron' pour une planification précise
import { CronJob } from "cron"; 
import { autoValidateOrders } from "../controllers/orderController.js";

export function startOrderCron() {
  // L'expression '0 * * * *' signifie : 0 minute de chaque heure, chaque jour.
  const job = new CronJob(
    '0 * * * *', 
    () => {
      console.log("⏳ Vérification horaire automatique des commandes...");
      autoValidateOrders();
    },
    null, // Fonction de fin (non utilisée ici)
    true, // Démarrer la tâche immédiatement
    'Africa/Lagos' // Fuseau horaire pour la précision (ajustez si besoin)
  );
  
  // Retourne le job pour une référence future (si nécessaire) et log l'activation
  console.log(`[CRON] Job 'autoValidateOrders' planifié pour s'exécuter chaque heure (0 * * * *).`);
  return job;
}
