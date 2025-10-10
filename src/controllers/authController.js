// controllers/authController.js

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { supabase } from "../server.js";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = "30d";

// Fonction d'aide pour récupérer l'ID du rôle par son nom
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

// ========================
// 🧑‍🏭 1. Register (Création d'utilisateur et de wallet)
// ========================
export async function register(req, res) {
  try {
    const { username, firstname, lastname, phone, email, password } = req.body;
    if (!username || !phone || !password) {
      return res.status(400).json({ error: "username, phone and password are required" });
    }

    // CRITIQUE: Vérification d'utilisateur existant par phone, username ou email
    const { data: existingUsers, error: checkError } = await supabase
      .from("users")
      .select("id")
      .or(`phone.eq.${phone},username.eq.${username},email.eq.${email}`) 
      .limit(1);

    if (checkError) throw checkError;

    if (existingUsers && existingUsers.length > 0) {
      return res.status(409).json({ error: "User with same phone/username/email already exists" });
    }

    const roleId = await getRoleIdByName("ACHETEUR"); // ⬅️ COHÉRENCE : Utiliser "ACHETEUR" au lieu de "BUYER"
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
        is_active: true, 
        email_confirmed: false
      }])
      .select()
      .single();

    if (error) throw error;

    // Création du wallet pour l'utilisateur (peut être externalisé en RPC pour l'atomicité)
    await supabase.from("wallets").insert([{ user_id: inserted.id, balance: 0 }]);

    const token = jwt.sign({ sub: inserted.id, role_id: roleId, role: "ACHETEUR" }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    return res.status(201).json({
      message: "User registered ✅",
      user: { id: inserted.id, username: inserted.username, phone: inserted.phone, email: inserted.email, role: "ACHETEUR" },
      token
    });
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message || err });
  }
}

// ========================
// 🔑 2. Login (Connexion générique)
// ========================
export async function login(req, res) {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) return res.status(400).json({ error: "identifier and password required" });

    // Recherche de l'utilisateur par email, phone ou username
    const { data: users, error } = await supabase
      .from("users")
      .select("*, roles(name)")
      .or(`email.eq.${identifier},phone.eq.${identifier},username.eq.${identifier}`)
      .limit(1);

    if (error) throw error;
    if (!users || users.length === 0) return res.status(401).json({ error: "Invalid credentials" });

    const user = users[0];
    const roleName = user.roles ? user.roles.name : 'UNKNOWN';
    
    // Vérification du statut actif
    if (!user.is_active) {
        return res.status(403).json({ error: "Your account is inactive. Please contact support." });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });
    
    const token = jwt.sign(
        { 
            sub: user.id, 
            role_id: user.role_id, 
            role: roleName, 
            is_super_admin: user.is_super_admin 
        }, 
        JWT_SECRET, 
        { expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({
      message: "Login successful ✅",
      user: { id: user.id, username: user.username, phone: user.phone, email: user.email, role: roleName, is_super_admin: user.is_super_admin },
      token
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message || err });
  }
}

// ========================
// 👑 3. Admin login endpoint
// ========================
export async function adminLogin(req, res) {
  try {
    const { admin_username, password } = req.body; // Retrait du phone, le username et le password devraient suffire
    if (!admin_username || !password) return res.status(400).json({ error: "admin_username and password required" });

    // Recherche de l'utilisateur par username, en vérifiant qu'il est bien ADMIN ou SUPER_ADMIN
    const { data: admins, error } = await supabase
      .from("users")
      .select("*, roles(name)")
      .eq("username", admin_username)
      // ⬅️ Filtre direct sur le rôle dans la base (si le RLS le permet)
      // Sinon, on fait confiance au résultat et on filtre après si nécessaire
      .limit(1); 

    if (error) throw error;
    if (!admins || admins.length === 0) return res.status(401).json({ error: "Invalid admin credentials" });

    const admin = admins[0];
    const roleName = admin.roles ? admin.roles.name : 'UNKNOWN';

    // Sécurité: Vérification que le rôle est bien un rôle d'administration
    if (roleName !== 'ADMIN' && roleName !== 'SUPER_ADMIN') {
         return res.status(401).json({ error: "Invalid admin credentials (Role access denied)" });
    }

    // Vérification du statut actif
    if (!admin.is_active) {
        return res.status(403).json({ error: "Admin account is inactive. Contact Super Admin." });
    }

    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) return res.status(401).json({ error: "Invalid admin credentials" });

    const token = jwt.sign(
        { 
            sub: admin.id, 
            role_id: admin.role_id, 
            role: roleName, 
            is_super_admin: admin.is_super_admin 
        }, 
        JWT_SECRET, 
        { expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({
      message: "Admin login successful 👑",
      user: { id: admin.id, username: admin.username, phone: admin.phone, role: roleName, is_super_admin: admin.is_super_admin },
      token
    });
  } catch (err) {
    console.error("Admin login error:", err);
    return res.status(500).json({ error: "Internal server error", details: err.message || err });
  }
           }
      
