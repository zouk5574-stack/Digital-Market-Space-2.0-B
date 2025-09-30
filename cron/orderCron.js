// cron/orderCron.js
import { autoValidateOrders } from "../controllers/orderController.js";

export function startOrderCron() {
  // Toutes les heures (3600000 ms)
  setInterval(() => {
    console.log("⏳ Vérification automatique des commandes...");
    autoValidateOrders();
  }, 60 * 60 * 1000);
}
