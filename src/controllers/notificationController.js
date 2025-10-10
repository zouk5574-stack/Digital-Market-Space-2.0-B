// src/controllers/notificationController.js (NOUVELLE FONCTIONNALITÉ)

import { supabase } from "../server.js";
import { addLog } from "./logController.js"; 

// =====================================
// ✅ 1. Lister les notifications de l'utilisateur
// =====================================
export async function getMyNotifications(req, res) {
  try {
    const userId = req.user.db.id;

    // Récupère les notifications non lues en premier, puis les autres
    const { data: notifications, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("read", { ascending: true }) // Les non lues en haut
      .order("created_at", { ascending: false }); // Les plus récentes en haut

    if (error) throw error;

    return res.json({ notifications });
  } catch (err) {
    console.error("Get notifications error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
}

// =====================================
// ✅ 2. Marquer une notification comme lue (simple)
// =====================================
export async function markAsRead(req, res) {
  try {
    const userId = req.user.db.id;
    const { id } = req.params;

    const { data: updated, error } = await supabase
      .from("notifications")
      .update({ read: true, read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId) // ⬅️ CRITIQUE : S'assurer que l'utilisateur est bien le destinataire
      .select("id, read")
      .single();

    if (error) throw error;

    if (!updated) {
        return res.status(404).json({ error: "Notification introuvable ou vous n'êtes pas l'utilisateur ciblé." });
    }

    return res.json({ message: "Notification marquée comme lue ✅", notification: updated });
  } catch (err) {
    console.error("Mark as read error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
}

// =====================================
// ✅ 3. Marquer TOUTES les notifications comme lues
// =====================================
export async function markAllAsRead(req, res) {
  try {
    const userId = req.user.db.id;

    // Met à jour toutes les notifications non lues de l'utilisateur
    const { error } = await supabase
      .from("notifications")
      .update({ read: true, read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("read", false);

    if (error) throw error;

    // Note : On ne retourne pas les données mises à jour pour des raisons de performance.
    return res.json({ message: "Toutes les notifications marquées comme lues ✅" });
  } catch (err) {
    console.error("Mark all as read error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
}

// =====================================
// ✅ 4. Supprimer une notification
// =====================================
export async function deleteNotification(req, res) {
  try {
    const userId = req.user.db.id;
    const { id } = req.params;

    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", id)
      .eq("user_id", userId); // ⬅️ CRITIQUE : S'assurer que l'utilisateur est le destinataire

    if (error) throw error;

    return res.json({ message: "Notification supprimée ✅" });
  } catch (err) {
    console.error("Delete notification error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
}
