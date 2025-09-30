// controllers/authController.js
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { supabase } from "../server.js";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = "30d";

async function getRoleIdByName(name) {
  const { data, error } = await supabase
    .from("roles")
    .select("id")
    .eq("name", name)
    .limit(1)
    .single();
  if (error) throw error;
  return data.id;
}

export async function register(req, res) {
  try {
    const { username, firstname, lastname, phone, email, password } = req.body;
    if (!username || !phone || !password) {
      return res.status(400).json({ error: "username, phone and password are required" });
    }

    // check existing user by phone or username or email
    const { data: existingByPhone } = await supabase
      .from("users")
      .select("id")
      .or(`phone.eq.${phone},username.eq.${username}${email ? `,email.eq.${email}` : ""}`)
      .limit(1);

    if (existingByPhone && existingByPhone.length > 0) {
      return res.status(409).json({ error: "User with same phone/username/email already exists" });
    }

    const roleId = await getRoleIdByName("buyer"); // default role

    const password_hash = await bcrypt.hash(password, 12);

    const { data: inserted, error } = await supabase
      .from("users")
      .insert([{
        role_id: roleId,
        username,
        firstname,
        lastname,
        phone,
        email: email || null,
        password_hash,
        is_super_admin: false,
        is_commission_exempt: false,
        email_confirmed: false
      }])
      .select()
      .single();

    if (error) throw error;

    // create wallet for user
    await supabase.from("wallets").insert([{ user_id: inserted.id, balance: 0 }]);

    const token = jwt.sign({ sub: inserted.id, role_id: roleId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    return res.status(201).json({
      message: "User registered",
      user: { id: inserted.id, username: inserted.username, phone: inserted.phone, email: inserted.email },
      token
    });
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message || err });
  }
}

export async function login(req, res) {
  try {
    const { identifier, password } = req.body;
    // identifier could be email or phone or username
    if (!identifier || !password) return res.status(400).json({ error: "identifier and password required" });

    // try to find user by email or phone or username
    const { data: users, error } = await supabase
      .from("users")
      .select("*")
      .or(`email.eq.${identifier},phone.eq.${identifier},username.eq.${identifier}`)
      .limit(1);

    if (error) throw error;
    if (!users || users.length === 0) return res.status(401).json({ error: "Invalid credentials" });

    const user = users[0];

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ sub: user.id, role_id: user.role_id, is_super_admin: user.is_super_admin }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    return res.json({
      message: "Login successful",
      user: { id: user.id, username: user.username, phone: user.phone, email: user.email, is_super_admin: user.is_super_admin },
      token
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message || err });
  }
}

/**
 * Admin login endpoint - requires admin_username + phone + password
 */
export async function adminLogin(req, res) {
  try {
    const { admin_username, phone, password } = req.body;
    if (!admin_username || !phone || !password) return res.status(400).json({ error: "admin_username, phone and password required" });

    // find admin user matching admin_username and phone and is_super_admin = true
    const { data: admins, error } = await supabase
      .from("users")
      .select("*")
      .eq("admin_username", admin_username)
      .eq("phone", phone)
      .eq("is_super_admin", true)
      .limit(1);

    if (error) throw error;
    if (!admins || admins.length === 0) return res.status(401).json({ error: "Invalid admin credentials" });

    const admin = admins[0];
    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) return res.status(401).json({ error: "Invalid admin credentials" });

    const token = jwt.sign({ sub: admin.id, role_id: admin.role_id, is_super_admin: true }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    return res.json({
      message: "Admin login successful",
      user: { id: admin.id, username: admin.username, admin_username: admin.admin_username, phone: admin.phone },
      token
    });
  } catch (err) {
    console.error("Admin login error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message || err });
  }
      }
