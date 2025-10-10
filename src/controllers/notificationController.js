// controllers/notificationController.js

import { supabase } from "../server.js";

/**
 * 1. Récupérer toutes les notifications de l'utilisateur actuel.
 */
export async function getMyNotifications(req, res) {
  try {
    // ➡️ COHÉRENCE : Utilisation de req.user.db.id pour récupérer l'ID utilisateur
    const userId = req.user.db.id; 

    // Inclure un filtre pour les non-lues et une limite pour la performance (non inclus dans votre version, mais bonne pratique)
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50); 

    if (error) throw error;

    return res.json({ success: true, notifications: data });
  } catch (err) {
    console.error("Get notifications error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
}

/**
 * 2. Marquer une notification comme lue.
 */
export async function markNotificationAsRead(req, res) {
  try {
    // ➡️ COHÉRENCE : Utilisation de req.user.db.id
    const userId = req.user.db.id;
    const { id } = req.params;

    // ➡️ COHÉRENCE : Utilisation de is_read et read_at pour la traçabilité dans la DB
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() }) 
      .eq("id", id)
      .eq("user_id", userId); // Sécurité CRITIQUE

    if (error) throw error;

    return res.json({ message: "Notification marquée comme lue ✅" });
  } catch (err) {
    console.error("Mark notification as read error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
}

/**
 * 3. Utilitaire pour créer une notification (à exporter pour les autres contrôleurs)
 */
export async function addNotification(userId, title, content, type = 'info', entity_id = null) {
    try {
        await supabase.from("notifications").insert([{
            user_id: userId,
            title,
            content,
            type, // ex: info, warning, success
            entity_id,
            is_read: false
        }]);
    } catch (err) {
        console.error("Failed to add notification:", err);
    }
}
