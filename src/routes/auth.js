// src/routes/auth.js
import express from 'express';
import {
  login,
  register,
  logout,
  getCurrentUser,
  refreshToken,
  updateUserRole
} from '../controllers/authController.js';

const router = express.Router();

router.post('/login', login);
router.post('/register', register);
router.post('/logout', logout);
router.post('/refresh-token', refreshToken);
router.get('/me', getCurrentUser);
router.patch('/:user_id/role', updateUserRole);

export default router;
