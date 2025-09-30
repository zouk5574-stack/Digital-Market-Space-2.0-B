// routes/auth.js
import express from "express";
import { register, login, adminLogin } from "../controllers/authController.js";

const router = express.Router();

/**
 * POST /api/auth/register
 * body: { username, firstname, lastname, phone, email?, password }
 */
router.post("/register", register);

/**
 * POST /api/auth/login
 * body: { identifier, password }
 * identifier = email OR phone OR username
 */
router.post("/login", login);

/**
 * POST /api/auth/admin-login
 * body: { admin_username, phone, password }
 */
router.post("/admin-login", adminLogin);

export default router;
