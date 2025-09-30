// middleware/authMiddleware.js
import jwt from "jsonwebtoken";
import { supabase } from "../server.js";
const JWT_SECRET = process.env.JWT_SECRET;

export async function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return res.status(401).json({ error: "Missing token" });

  const token = authHeader.split(" ")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // attach user info to req
    req.user = payload; // contains sub, role_id, is_super_admin
    // Optionally fetch latest user row and attach minimal info
    const { data: userRows, error } = await supabase.from("users").select("id,username,phone,email,is_super_admin,role_id").eq("id", payload.sub).limit(1);
    if (error || !userRows || userRows.length === 0) {
      return res.status(401).json({ error: "Invalid token user" });
    }
    req.user.db = userRows[0];
    next();
  } catch (err) {
    console.error("JWT verify error:", err);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
