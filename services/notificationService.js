// services/notificationService.js
import { supabase } from "../server.js";

// 👉 Enregistrer une notification en DB
export async function sendNotification(userId, title, message) {
  const { error } = await supabase.from("notifications").insert([
    {
      user_id: userId,
      title,
      message,
      read: false,
      created_at: new Date(),
    },
  ]);

  if (error) {
    console.error("Erreur envoi notification:", error);
  }
}
