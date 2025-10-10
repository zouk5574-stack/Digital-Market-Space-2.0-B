// controllers/logController.js

import { supabase } from "../server.js";

// ⭐ Table dédiée aux actions sensibles de l'Admin
const LOG_TABLE = "admin_logs"; 

/**
 * ✅ Ajouter un log (à appeler dans d'autres controllers lors d'actions sensibles)
 * Enregistre l'action effectuée par l'administrateur (ou Super Admin).
 * @param {string} userId - L'ID de l'utilisateur qui effectue l'action (req.user.db.id).
 * @param {string} action - Description courte de l'action (ex: 'USER_BLOCKED').
 * @param {object} details - Détails JSON de l'action (ex: { target_id: '...', old_value: '...' }).
 */
export async function addLog(userId, action, details = {}) {
  try {
    // Note: Utilisation de userId car l'Admin est le seul ayant le droit d'utiliser cette fonction
    await supabase.from(LOG_TABLE).insert([{
      admin_id: userId,
      action,
      details
    }]);
  } catch (err) {
    // Cette fonction ne devrait pas bloquer l'action principale, juste logguer l'erreur
    console.error("Add log error:", err);
  }
}

/**
 * ✅ Récupérer tous les logs (admin only - sécurité gérée par le routeur)
 */
export async function getLogs(req, res) {
  try {
    // Le middleware requireRole(["ADMIN", "SUPER_ADMIN"]) garantit l'accès.
    
    const { data, error } = await supabase
      .from(LOG_TABLE)
      // Joindre la table des utilisateurs pour le nom
      .select("*, admin:admin_id(username)") 
      .order("created_at", { ascending: false });

    if (error) throw error;
    
    // Si la jointure utilise 'admin_id', le retour sera { admin: { username: '...' } }
    return res.json({ success: true, logs: data });
  } catch (err) {
    console.error("Get logs error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
}
