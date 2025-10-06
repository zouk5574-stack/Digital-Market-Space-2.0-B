// middleware/authMiddleware.js
// Un middleware unique et compatible avec tout le projet:
// - exporte `authenticateJWT` (compatibilité)
// - exporte `protect` (alias utilisé dans tes routes)
// - attache req.user (payload) et req.user.db (ligne users depuis Supabase)
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

    // Attach minimal payload
    req.user = {
      sub: payload.sub,
      role_id: payload.role_id,
      is_super_admin: payload.is_super_admin === true || payload.is_super_admin === "true",
      jwt_payload: payload
    };

    // Fetch the latest user row from Supabase and attach as req.user.db
    // This ensures role checks can use req.user.db.role or req.user.db.is_super_admin
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

    // keep backward compatibility: some code expects req.user.role or req.user.is_super_admin directly
    req.user.role = req.user.db.role;
    req.user.is_super_admin = req.user.is_super_admin || req.user.db.is_super_admin;

    return next();
  } catch (err) {
    console.error("authenticateJWT unexpected error:", err);
    return res.status(500).json({ error: "Authentication error" });
  }
}

// Alias utilisé dans tes routes (beaucoup de fichiers importent `protect`)
export const protect = authenticateJWT;
