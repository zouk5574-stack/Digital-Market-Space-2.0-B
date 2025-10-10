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

// ========================
// 🧑‍🏭 1. Register (Création d'utilisateur et de wallet)
// ========================
export async function register(req, res) {
  try {
    const { username, firstname, lastname, phone, email, password } = req.body;
    if (!username || !phone || !password) {
      return res.status(400).json({ error: "username, phone and password are required" });
    }

    // Création de la condition OR pour la vérification d'existence
    let orConditions = [`phone.eq.${phone}`, `username.eq.${username}`];
    if (email) {
        orConditions.push(`email.eq.${email}`);
    }
    
    // Vérification d'utilisateur existant par phone, username ou email
    const { data: existingUsers, error: checkError } = await supabase
      .from("users")
      .select("id")
      // ⬅️ Correction de la syntaxe Supabase OR
      .or(orConditions.join(',')) 
      .limit(1);

    if (checkError) throw checkError;

    if (existingUsers && existingUsers.length > 0) {
      return res.status(409).json({ error: "User with same phone/username/email already exists" });
    }

    const roleId = await getRoleIdByName("BUYER"); // ⬅️ Utilisation de la majuscule "BUYER" pour la cohérence
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
        is_active: true, // ⬅️ Ajout de is_active par défaut
        email_confirmed: false
      }])
      .select()
      .single();

    if (error) throw error;

    // Création du wallet pour l'utilisateur
    await supabase.from("wallets").insert([{ user_id: inserted.id, balance: 0 }]);

    const token = jwt.sign({ sub: inserted.id, role_id: roleId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    return res.status(201).json({
      message: "User registered ✅",
      user: { id: inserted.id, username: inserted.username, phone: inserted.phone, email: inserted.email },
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

    // try to find user by email or phone or username
    const { data: users, error } = await supabase
      .from("users")
      .select("*, roles(name)")
      // ⬅️ Correction de la syntaxe Supabase OR
      .or(`email.eq.${identifier},phone.eq.${identifier},username.eq.${identifier}`)
      .limit(1);

    if (error) throw error;
    if (!users || users.length === 0) return res.status(401).json({ error: "Invalid credentials" });

    const user = users[0];

    // Vérification du statut actif
    if (!user.is_active) {
        return res.status(403).json({ error: "Your account is inactive. Please contact support." });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });
    
    // Le nom du rôle est récupéré via la jointure 'roles'
    const roleName = user.roles ? user.roles.name : 'UNKNOWN';

    const token = jwt.sign(
        { 
            sub: user.id, 
            role_id: user.role_id, 
            role: roleName, // ⬅️ Ajout du nom du rôle pour le middleware
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
    // Identifier l'admin par son username (qui fait office d'admin_username) et son téléphone
    const { admin_username, phone, password } = req.body; 
    if (!admin_username || !phone || !password) return res.status(400).json({ error: "admin_username, phone and password required" });

    // Recherche de l'utilisateur par username et téléphone, en vérifiant qu'il est bien un ADMIN ou SUPER_ADMIN
    const { data: admins, error } = await supabase
      .from("users")
      .select("*, roles(name)")
      // ⬅️ Correction: Utiliser 'username' et vérifier que le rôle est 'ADMIN' ou 'SUPER_ADMIN' (plus sûr que is_super_admin=true seul)
      .eq("username", admin_username)
      .eq("phone", phone)
      .or(`roles.name.eq.ADMIN,roles.name.eq.SUPER_ADMIN`)
      .limit(1);

    if (error) throw error;
    if (!admins || admins.length === 0) return res.status(401).json({ error: "Invalid admin credentials" });

    const admin = admins[0];
    const roleName = admin.roles ? admin.roles.name : 'UNKNOWN';

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
