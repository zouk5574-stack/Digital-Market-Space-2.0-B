// controllers/notificationController.js
import { supabase } from "../server.js";

// ✅ Récupérer mes notifications
export async function getMyNotifications(req, res) {
  try {
    const userId = req.user.sub;

    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return res.json(data);
  } catch (err) {
    console.error("Get notifications error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
}

// ✅ Marquer une notification comme lue
export async function markNotificationAsRead(req, res) {
  try {
    const userId = req.user.sub;
    const { id } = req.params;

    const { error } = await supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", id)
      .eq("user_id", userId);

    if (error) throw error;

    return res.json({ message: "Notification marquée comme lue ✅" });
  } catch (err) {
    console.error("Mark notification as read error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
}
