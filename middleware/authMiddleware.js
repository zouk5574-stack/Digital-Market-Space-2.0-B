// middleware/authMiddleware.js
import jwt from "jsonwebtoken";
import { supabase } from "../server.js";

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * authenticateJWT: vérifie le token et attache req.user
 * protect: alias pour compatibilité (nom utilisé dans routes)
 */
export async function authenticateJWT(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing token" });
    }

    const token = authHeader.split(" ")[1];
    const payload = jwt.verify(token, JWT_SECRET);

    // payload should contain sub (user id), role_id, is_super_admin
    req.user = {
      sub: payload.sub,
      role_id: payload.role_id,
      is_super_admin: payload.is_super_admin === true || payload.is_super_admin === "true",
      // keep the raw token payload for reference
      jwt_payload: payload,
    };

    // Attach latest user row (minimal) to req.user.db
    const { data: userRow, error } = await supabase
      .from("users")
      .select("id, role, role_id, is_super_admin, admin_username, email")
      .eq("id", payload.sub)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("authMiddleware: error fetching user row:", error);
      return res.status(401).json({ error: "Invalid token user" });
    }
    if (!userRow) {
      return res.status(401).json({ error: "Invalid token user" });
    }

    req.user.db = userRow;
    next();
  } catch (err) {
    console.error("authenticateJWT error:", err);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// alias naming used by many routes
export const protect = authenticateJWT;
