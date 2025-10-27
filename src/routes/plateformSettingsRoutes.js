import express from 'express';
import {
  getPlatformSettings,
  updatePlatformSettings,
  getPublicSettings
} from '../controllers/platformSettingsController.js';
import { requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// Route publique
router.get('/public', getPublicSettings);

// Routes admin
router.get('/', requireAdmin, getPlatformSettings);
router.put('/', requireAdmin, updatePlatformSettings);

export default router;
