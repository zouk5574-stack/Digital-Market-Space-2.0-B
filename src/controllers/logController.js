// src/controllers/logController.js
import { supabase } from "../server.js";

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
    const { error } = await supabase
      .from(LOG_TABLE)
      .insert([{
        admin_id: userId,
        action,
        details,
        ip_address: details.ip_address || 'system',
        user_agent: details.user_agent || 'ai-assistant',
        created_at: new Date().toISOString()
      }]);

    if (error) {
      console.error('Log insertion error:', error);
      console.log(`AI_LOG: ${action}`, { userId, ...details });
    }

    return { success: true };
  } catch (error) {
    console.error('Logging failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * ✅ Journal de sécurité pour les incidents critiques
 * @param {string} userId - ID de l'utilisateur concerné
 * @param {string} securityEvent - Type d'événement de sécurité
 * @param {object} details - Détails de l'incident
 */
export async function addSecurityLog(userId, securityEvent, details = {}) {
  try {
    const { error } = await supabase
      .from(LOG_TABLE)
      .insert([{
        admin_id: userId,
        action: `SECURITY_${securityEvent}`,
        details: {
          ...details,
          security_level: 'HIGH',
          timestamp: new Date().toISOString()
        },
        ip_address: details.ip_address || 'system',
        user_agent: details.user_agent || 'ai-assistant'
      }]);

    if (error) {
      console.error('Security log error:', error);
      console.error(`🔴 SECURITY_ALERT: ${securityEvent}`, { userId, details });
    }

    return { success: true };
  } catch (error) {
    console.error('Security logging failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * ✅ Récupérer les logs de l'assistant IA (admin only)
 * @param {number} limit - Nombre de logs à récupérer
 */
export async function getAILogs(limit = 50) {
  try {
    const { data: logs, error } = await supabase
      .from(LOG_TABLE)
      .select('*')
      .ilike('action', 'AI_%')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return { logs: logs || [], error: null };
  } catch (error) {
    console.error('Get AI logs error:', error);
    return { logs: [], error: error.message };
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

/**
 * ✅ Filtrer les logs par type d'action
 * @param {string} actionFilter - Filtre sur le type d'action
 * @param {number} limit - Nombre maximum de résultats
 */
export async function getLogsByAction(actionFilter, limit = 100) {
  try {
    const { data: logs, error } = await supabase
      .from(LOG_TABLE)
      .select('*')
      .ilike('action', `%${actionFilter}%`)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return { logs: logs || [], error: null };
  } catch (error) {
    console.error('Get logs by action error:', error);
    return { logs: [], error: error.message };
  }
}

/**
 * ✅ Nettoyer les logs anciens (maintenance)
 * @param {number} daysToKeep - Nombre de jours à conserver
 */
export async function cleanupOldLogs(daysToKeep = 30) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const { error } = await supabase
      .from(LOG_TABLE)
      .delete()
      .lt('created_at', cutoffDate.toISOString());

    if (error) throw error;

    console.log(`✅ Logs cleanup completed - kept ${daysToKeep} days of data`);
    return { success: true, message: `Logs older than ${daysToKeep} days have been cleaned up` };
  } catch (error) {
    console.error('Cleanup logs error:', error);
    return { success: false, error: error.message };
  }
}

export default {
  addLog,
  addSecurityLog,
  getAILogs,
  getLogs,
  getLogsByAction,
  cleanupOldLogs
};
