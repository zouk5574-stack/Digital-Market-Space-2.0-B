import express from 'express';
import { getSettings, updateSettings } from '../../controllers/platformSettingsController.js';
import { verifyAdminToken } from '../../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', verifyAdminToken, getSettings);
router.put('/', verifyAdminToken, updateSettings);

export default router;
