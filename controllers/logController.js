// controllers/logController.js
import { supabase } from "../server.js";

// ✅ Ajouter un log (à appeler dans d'autres controllers)
export async function addLog(adminId, action, details = {}) {
  try {
    await supabase.from("admin_logs").insert([{
      admin_id: adminId,
      action,
      details
    }]);
  } catch (err) {
    console.error("Add log error:", err);
  }
}

// ✅ Récupérer tous les logs (admin only)
export async function getLogs(req, res) {
  try {
    if (!req.user.is_super_admin) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    const { data, error } = await supabase
      .from("admin_logs")
      .select("*, users(username)")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return res.json(data);
  } catch (err) {
    console.error("Get logs error:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
}
