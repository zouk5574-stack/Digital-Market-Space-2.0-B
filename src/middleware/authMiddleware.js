// middleware/authMiddleware.js
import jwt from "jsonwebtoken";
import { supabase } from "../server.js";

const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_ME";

/**
 * authenticateJWT: vérifie le token et attache req.user + req.user.db
 */
export async function authenticateJWT(req, res, next) {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or malformed Authorization header" });
    }

    const token = authHeader.split(" ")[1];
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      console.error("JWT verify error:", err);
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    req.user = {
      sub: payload.sub,
      role_id: payload.role_id,
      is_super_admin: payload.is_super_admin === true || payload.is_super_admin === "true",
      jwt_payload: payload
    };

    const { data: userRow, error } = await supabase
      .from("users")
      .select("id, role, role_id, is_super_admin, admin_username, email")
      .eq("id", payload.sub)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("authMiddleware: error fetching user row:", error);
      return res.status(401).json({ error: "Unable to validate token user" });
    }
    if (!userRow) {
      return res.status(401).json({ error: "Invalid token user" });
    }

    req.user.db = userRow;
    req.user.role = req.user.db.role;
    req.user.is_super_admin = req.user.is_super_admin || req.user.db.is_super_admin;

    return next();
  } catch (err) {
    console.error("authenticateJWT unexpected error:", err);
    return res.status(500).json({ error: "Authentication error" });
  }
}

// Alias utilisés ailleurs dans le projet
export const protect = authenticateJWT;
export const authMiddleware = authenticateJWT; // ✅ Compatibilité complète
