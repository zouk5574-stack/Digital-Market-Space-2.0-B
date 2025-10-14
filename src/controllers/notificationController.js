// src/controllers/notificationController.js (VERSION COMPLÉTÉE)

import { supabase } from "../server.js";
import { addLog } from "./logController.js"; 

// =====================================
// 🆕 FONCTIONS ADMIN
// =====================================

// 🆕 1. Envoyer une notification en masse
export async function sendBulkNotification(req, res) {
  try {
    const adminId = req.user.sub;
    const { title, message, type, target, is_urgent } = req.body;

    // Validation
    if (!title || !message) {
      return res.status(400).json({ error: "Titre et message requis" });
    }

    // Déterminer les utilisateurs cibles
    let userQuery = supabase
      .from('users')
      .select('id, role_id, roles(name)')
      .eq('is_active', true);

    switch (target) {
      case 'BUYERS':
        const buyerRoleId = await getRoleIdByName('ACHETEUR');
        userQuery = userQuery.eq('role_id', buyerRoleId);
        break;
      case 'SELLERS':
        const sellerRoleId = await getRoleIdByName('VENDEUR');
        userQuery = userQuery.eq('role_id', sellerRoleId);
        break;
      // 'ALL' - pas de filtre supplémentaire
    }

    const { data: targetUsers, error: usersError } = await userQuery;
    if (usersError) throw usersError;

    if (!targetUsers || targetUsers.length === 0) {
      return res.status(400).json({ error: "Aucun utilisateur trouvé pour la cible spécifiée" });
    }

    // Créer les notifications pour chaque utilisateur
    const notifications = targetUsers.map(user => ({
      user_id: user.id,
      title,
      message,
      type,
      is_urgent: is_urgent || false,
      sent_by: adminId,
      target_group: target,
      read: false,
      created_at: new Date().toISOString()
    }));

    const { data: insertedNotifications, error: insertError } = await supabase
      .from('notifications')
      .insert(notifications)
      .select();

    if (insertError) throw insertError;

    // Log l'action admin
    await addLog(adminId, 'BULK_NOTIFICATION_SENT', {
      title,
      target,
      recipientCount: targetUsers.length,
      type,
      is_urgent
    });

    res.status(201).json({
      message: `Notification envoyée à ${targetUsers.length} utilisateur(s)`,
      notification_count: targetUsers.length,
      target
    });

  } catch (err) {
    console.error("Send bulk notification error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
}

// 🆕 2. Historique des notifications envoyées (pour admin)
export async function getNotificationHistory(req, res) {
  try {
    const { data: notifications, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100); // Limiter pour les performances

    if (error) throw error;

    // Compter les destinataires par notification groupée
    const notificationsWithStats = await Promise.all(
      (notifications || []).map(async (notif) => {
        const { count } = await supabase
          .from('notifications')
          .select('id', { count: 'exact' })
          .eq('title', notif.title)
          .eq('created_at', notif.created_at);

        return {
          ...notif,
          recipient_count: count || 1
        };
      })
    );

    // Filtrer les doublons (notifications groupées)
    const uniqueNotifications = notificationsWithStats.filter((notif, index, self) =>
      index === self.findIndex(n => 
        n.title === notif.title && n.created_at === notif.created_at
      )
    );

    res.json({ notifications: uniqueNotifications });
  } catch (err) {
    console.error("Get notification history error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
}

// 🆕 3. Supprimer une notification (admin)
export async function adminDeleteNotification(req, res) {
  try {
    const adminId = req.user.sub;
    const { id } = req.params;

    // Supprimer toutes les instances de cette notification
    const { data: notification } = await supabase
      .from('notifications')
      .select('title, created_at')
      .eq('id', id)
      .single();

    if (!notification) {
      return res.status(404).json({ error: "Notification introuvable" });
    }

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('title', notification.title)
      .eq('created_at', notification.created_at);

    if (error) throw error;

    await addLog(adminId, 'NOTIFICATION_DELETED', { notificationId: id });

    res.json({ message: "Notification et toutes ses instances supprimées ✅" });
  } catch (err) {
    console.error("Admin delete notification error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
}

// 🆕 4. Statistiques utilisateurs
export async function getUserStats(req, res) {
  try {
    const [total, buyers, sellers] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact' }).eq('is_active', true),
      supabase.from('users').select('id', { count: 'exact' }).eq('is_active', true).eq('role_id', await getRoleIdByName('ACHETEUR')),
      supabase.from('users').select('id', { count: 'exact' }).eq('is_active', true).eq('role_id', await getRoleIdByName('VENDEUR'))
    ]);

    res.json({
      total: total.count || 0,
      buyers: buyers.count || 0,
      sellers: sellers.count || 0
    });
  } catch (err) {
    console.error("Get user stats error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
}

// =====================================
// ✅ FONCTIONS EXISTANTES (conservées)
// =====================================

export async function getMyNotifications(req, res) {
  try {
    const userId = req.user.sub;

    const { data: notifications, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("read", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) throw error;

    return res.json({ notifications: notifications || [] });
  } catch (err) {
    console.error("Get notifications error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
}

export async function markAsRead(req, res) {
  try {
    const userId = req.user.sub;
    const { id } = req.params;

    const { data: updated, error } = await supabase
      .from("notifications")
      .update({ read: true, read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId)
      .select("id, read")
      .single();

    if (error) throw error;

    if (!updated) {
        return res.status(404).json({ error: "Notification introuvable" });
    }

    return res.json({ message: "Notification marquée comme lue ✅", notification: updated });
  } catch (err) {
    console.error("Mark as read error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
}

export async function markAllAsRead(req, res) {
  try {
    const userId = req.user.sub;

    const { error } = await supabase
      .from("notifications")
      .update({ read: true, read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("read", false);

    if (error) throw error;

    return res.json({ message: "Toutes les notifications marquées comme lues ✅" });
  } catch (err) {
    console.error("Mark all as read error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
}

export async function deleteNotification(req, res) {
  try {
    const userId = req.user.sub;
    const { id } = req.params;

    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) throw error;

    return res.json({ message: "Notification supprimée ✅" });
  } catch (err) {
    console.error("Delete notification error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
}

// =====================================
// 🛠️ FONCTION UTILITAIRE
// =====================================

async function getRoleIdByName(name) {
  const { data, error } = await supabase
    .from("roles")
    .select("id")
    .eq("name", name)
    .single();
  
  if (error || !data) throw new Error(`Role '${name}' non trouvé`);
  return data.id;
                  }
