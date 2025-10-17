// =========================================================
// src/controllers/authController.js (VERSION DÉFINITIVE AVEC LOGOUT)
// =========================================================

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { supabase } from "../server.js";
import { addLog } from "./logController.js"; 

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = "1000000d";
const INVALID_CREDENTIALS_MSG = "Identifiants invalides."; 
const AUTHORIZED_REGISTRATION_ROLES = ['ACHETEUR', 'VENDEUR']; 

async function getRoleIdByName(name) {
  const { data, error } = await supabase
    .from("roles")
    .select("id")
    .eq("name", name)
    .limit(1)
    .single();
  if (error || !data) throw new Error(`Role ID for '${name}' not found.`); 
  return data.id;
}

// ========================
// 🧑‍🏭 1. Register (CRÉATION AVEC RÔLE)
// ========================
export async function register(req, res) {
    try {
        const { username, firstname, lastname, phone, email, password, role } = req.body;
        
        if (!username || !phone || !password || !role) {
            return res.status(400).json({ error: "Le nom d'utilisateur, le téléphone, le mot de passe et le rôle sont requis" });
        }

        const roleToAssign = role.toUpperCase();
        if (!AUTHORIZED_REGISTRATION_ROLES.includes(roleToAssign)) {
            return res.status(403).json({ error: `Rôle invalide ou non autorisé. Seuls les rôles ${AUTHORIZED_REGISTRATION_ROLES.join(' ou ')} sont permis à l'inscription.` });
        }

        const { data: existingUsers, error: checkError } = await supabase
            .from("users")
            .select("id")
            .or(`phone.eq.${phone},username.eq.${username},email.eq.${email}`); 

        if (checkError) throw checkError;
        if (existingUsers && existingUsers.length > 0) {
            return res.status(409).json({ error: "Un utilisateur avec ce téléphone, nom d'utilisateur ou e-mail existe déjà." });
        }

        const roleId = await getRoleIdByName(roleToAssign);
        const password_hash = await bcrypt.hash(password, 12);

        const { data: inserted, error } = await supabase
            .from("users")
            .insert([{
                role_id: roleId,
                username,
                firstname,
                lastname,
                phone,
                email: email ? email.toLowerCase() : null, 
                password_hash,
                is_super_admin: false, 
                is_active: true, 
                email_confirmed: false
            }])
            .select()
            .single();

        if (error) throw error;

        await supabase.from("wallets").insert([{ user_id: inserted.id, balance: 0 }]);
        addLog(inserted.id, 'USER_REGISTERED', { role: roleToAssign, ip: req.ip });

        const token = jwt.sign({ sub: inserted.id, role_id: roleId, role: roleToAssign, is_super_admin: false }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

        return res.status(201).json({
            message: `Compte ${roleToAssign} créé avec succès ✅`,
            user: { id: inserted.id, username: inserted.username, phone: inserted.phone, email: inserted.email, role: roleToAssign, is_super_admin: false },
            token
        });
    } catch (err) {
        console.error("Register error:", err);
        const detail = err.message || err;
        if (detail.includes("Role ID for")) {
            return res.status(500).json({ error: "Erreur de configuration du rôle. Le rôle sélectionné n'existe pas dans la base de données.", details: detail });
        }
        return res.status(500).json({ error: "Erreur serveur interne", details: detail });
    }
}

// ========================
// 🔑 2. Login (Connexion générique)
// ========================
export async function login(req, res) {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) return res.status(400).json({ error: "Identifiant et mot de passe requis" });

    const { data: users, error } = await supabase
      .from("users")
      .select("*, roles(name)")
      .or(`phone.eq.${identifier},username.eq.${identifier}`)
      .limit(1);

    if (error) throw error;
    const user = users?.[0];
    if (!user) return res.status(401).json({ error: INVALID_CREDENTIALS_MSG });
    
    const roleName = user.roles?.name || user.role || 'UNKNOWN';

    if (user.is_super_admin) {
      return res.status(403).json({ error: "Ce compte doit utiliser le formulaire de connexion administrateur dédié." });
    }
    
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: INVALID_CREDENTIALS_MSG });

    if (!user.is_active) {
        addLog(user.id, 'LOGIN_FAILED_INACTIVE', { identifier, ip: req.ip });
        return res.status(403).json({ error: "Votre compte est inactif. Veuillez contacter le support." }); 
    }
    
    addLog(user.id, 'USER_LOGIN', { role: roleName, ip: req.ip });

    const token = jwt.sign(
        { sub: user.id, role_id: user.role_id, role: roleName, is_super_admin: false }, 
        JWT_SECRET, 
        { expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({
      message: "Connexion réussie ✅",
      user: { id: user.id, username: user.username, phone: user.phone, email: user.email, role: roleName, is_super_admin: false },
      token
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Erreur serveur interne", details: err.message || err });
  }
}

// ========================
// 👑 3. Super Admin Login (STRICTE 4 CHAMPS)
// ========================
export async function superAdminLogin(req, res) {
  try {
    const { firstname, lastname, phone, password } = req.body;
    if (!firstname || !lastname || !phone || !password) {
      return res.status(400).json({ error: "Nom, Prénom, Téléphone et Mot de passe sont requis." });
    }

    const { data: admins, error } = await supabase
      .from("users")
      .select("*, roles(name)")
      .eq("firstname", firstname)
      .eq("lastname", lastname)
      .eq("phone", phone)
      .eq("is_super_admin", true)
      .limit(1);

    if (error) throw error;
    
    if (!admins || admins.length === 0) {
        console.warn(`[SECURITY] Tentative de connexion Admin échouée (informations ne correspondent pas).`);
        return res.status(401).json({ error: INVALID_CREDENTIALS_MSG });
    }

    const admin = admins[0];
    const roleName = admin.roles?.name || admin.role || 'SUPER_ADMIN';

    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) {
        console.warn(`[SECURITY] Tentative de connexion Admin échouée (mot de passe incorrect).`);
        return res.status(401).json({ error: INVALID_CREDENTIALS_MSG });
    }

    if (!admin.is_active) {
        addLog(admin.id, 'ADMIN_LOGIN_FAILED_INACTIVE', { phone, ip: req.ip });
        return res.status(403).json({ error: "Le compte administrateur est inactif." });
    }
    
    const token = jwt.sign(
        { sub: admin.id, role_id: admin.role_id, role: roleName, is_super_admin: true }, 
        JWT_SECRET, 
        { expiresIn: JWT_EXPIRES_IN }
    );

    addLog(admin.id, 'SUPER_ADMIN_LOGIN', { phone: phone, ip: req.ip });

    return res.json({
      message: "Connexion Super Admin réussie 👑",
      user: { id: admin.id, username: admin.username, phone: admin.phone, email: admin.email, role: roleName, is_super_admin: true },
      token
    });
  } catch (err) {
    console.error("Super Admin login error:", err);
    return res.status(500).json({ error: "Erreur serveur interne." });
  }
}

// ========================
// 🚪 4. Logout (Déconnexion)
// ========================
export async function logout(req, res) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "Utilisateur non authentifié" });
    }

    // Log de déconnexion
    await addLog(req.user.id, 'USER_LOGOUT', { 
      user_role: req.user.role,
      is_super_admin: req.user.is_super_admin,
      ip: req.ip 
    });

    return res.json({ 
      success: true, 
      message: "Déconnexion réussie ✅" 
    });
  } catch (err) {
    console.error("Logout error:", err);
    return res.status(500).json({ error: "Erreur serveur lors de la déconnexion", details: err.message });
  }
             }
