// =========================================================
// controllers/authController.js (MISE À JOUR & OPTIMISATION)
// =========================================================

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { supabase } from "../server.js";
import { addLog } from "./logController.js"; // 🚨 NOUVEL IMPORT CRITIQUE

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = "30d";
const INVALID_CREDENTIALS_MSG = "Identifiants invalides."; // Message générique pour la sécurité

// Fonction d'aide pour récupérer l'ID du rôle par son nom
async function getRoleIdByName(name) {
  const { data, error } = await supabase
    .from("roles")
    .select("id")
    .eq("name", name)
    .limit(1)
    .single();
  // 🚨 Ajout de la vérification : si le rôle n'existe pas, cela doit échouer.
  if (error || !data) throw new Error(`Role ID for '${name}' not found.`); 
  return data.id;
}

// ========================
// 🧑‍🏭 1. Register (Création d'utilisateur et de wallet)
// ========================
export async function register(req, res) {
  try {
    const { username, firstname, lastname, phone, email, password } = req.body;
    if (!username || !phone || !password) {
      return res.status(400).json({ error: "Le nom d'utilisateur, le téléphone et le mot de passe sont requis" });
    }

    // 🚨 SÉCURITÉ : La seule façon de s'inscrire est en tant qu'ACHETEUR ou VENDEUR, jamais ADMIN.
    const roleToAssign = 'ACHETEUR'; 

    // CRITIQUE: Vérification d'utilisateur existant par phone, username ou email
    const { data: existingUsers, error: checkError } = await supabase
      .from("users")
      .select("id")
      // Le filtre or doit être construit correctement pour PostgREST/Supabase
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
        role: roleToAssign, // 🚨 Ajout du champ 'role' pour le middleware (si vous utilisez le nom du rôle)
        username,
        firstname,
        lastname,
        phone,
        email: email ? email.toLowerCase() : null, // Mettre l'email en minuscules
        password_hash,
        is_super_admin: false, // 🚨 CRITIQUE : Toujours false pour les inscriptions
        is_active: true, 
        email_confirmed: false
      }])
      .select()
      .single();

    if (error) throw error;

    // Création du wallet 
    await supabase.from("wallets").insert([{ user_id: inserted.id, balance: 0 }]);
    
    // 🚨 JOURNALISATION : Enregistrement de l'inscription
    addLog(inserted.id, 'USER_REGISTERED', { role: roleToAssign, ip: req.ip });

    const token = jwt.sign({ sub: inserted.id, role_id: roleId, role: roleToAssign }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    return res.status(201).json({
      message: `Compte ${roleToAssign} créé avec succès ✅`,
      user: { id: inserted.id, username: inserted.username, phone: inserted.phone, email: inserted.email, role: roleToAssign },
      token
    });
  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({ error: "Erreur serveur interne", details: err.message || err });
  }
}

// ========================
// 🔑 2. Login (Connexion générique)
// ========================
export async function login(req, res) {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) return res.status(400).json({ error: "Identifiant et mot de passe requis" });

    // Recherche de l'utilisateur par email, phone ou username
    const { data: users, error } = await supabase
      .from("users")
      .select("*, roles(name)")
      .or(`email.eq.${identifier},phone.eq.${identifier},username.eq.${identifier}`)
      .limit(1);

    if (error) throw error;

    const user = users?.[0];
    if (!user) return res.status(401).json({ error: INVALID_CREDENTIALS_MSG });

    const roleName = user.roles?.name || user.role || 'UNKNOWN';

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: INVALID_CREDENTIALS_MSG });

    // 🚨 Sécurité : Vérification du statut après la vérification du mot de passe (pour éviter d'informer l'attaquant)
    if (!user.is_active) {
        // Loguer la tentative de connexion échouée d'un compte inactif
        addLog(user.id, 'LOGIN_FAILED_INACTIVE', { identifier, ip: req.ip });
        return res.status(403).json({ error: "Votre compte est inactif. Veuillez contacter le support." }); 
    }
    
    // 🚨 JOURNALISATION : Connexion réussie
    addLog(user.id, 'USER_LOGIN', { role: roleName, ip: req.ip });

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
      message: "Connexion réussie ✅",
      user: { id: user.id, username: user.username, phone: user.phone, email: user.email, role: roleName, is_super_admin: user.is_super_admin },
      token
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Erreur serveur interne", details: err.message || err });
  }
}

// ========================
// 👑 3. Admin login endpoint (Dédié et Strict)
// ========================
export async function adminLogin(req, res) {
  try {
    const { username, password } = req.body; // Utilisation de 'username' pour la cohérence
    if (!username || !password) return res.status(400).json({ error: "Nom d'utilisateur administrateur et mot de passe requis" });

    // Recherche de l'utilisateur par username, TRES STRICTE: doit être SUPER ADMIN
    const { data: admins, error } = await supabase
      .from("users")
      .select("*, roles(name)")
      .eq("username", username)
      .eq("is_super_admin", true) // 🚨 CRITIQUE : S'assurer qu'il est le seul Super Admin
      .limit(1); 

    if (error) throw error;

    const admin = admins?.[0];
    if (!admin) return res.status(401).json({ error: INVALID_CREDENTIALS_MSG });

    const roleName = admin.roles?.name || admin.role || 'UNKNOWN';

    // Sécurité: Redondance, mais bonne pratique. Si is_super_admin est true, le rôle devrait être ADMIN/SUPER_ADMIN.
    if (!admin.is_super_admin) {
         return res.status(401).json({ error: INVALID_CREDENTIALS_MSG });
    }

    const match = await bcrypt.compare(password, admin.password_hash);
    if (!match) return res.status(401).json({ error: INVALID_CREDENTIALS_MSG });

    // 🚨 Sécurité : Vérification du statut après la vérification du mot de passe
    if (!admin.is_active) {
        addLog(admin.id, 'ADMIN_LOGIN_FAILED_INACTIVE', { username, ip: req.ip });
        return res.status(403).json({ error: "Le compte administrateur est inactif." });
    }
    
    // 🚨 JOURNALISATION : Connexion Admin réussie
    addLog(admin.id, 'ADMIN_LOGIN', { role: roleName, ip: req.ip });

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
      message: "Connexion administrateur réussie 👑",
      user: { id: admin.id, username: admin.username, phone: admin.phone, role: roleName, is_super_admin: admin.is_super_admin },
      token
    });
  } catch (err) {
    console.error("Admin login error:", err);
    return res.status(500).json({ error: "Erreur serveur interne", details: err.message || err });
  }
}
