// src/routes/freelanceRoutes.js
import express from 'express';
import {
  getFreelanceMissions,
  createFreelanceMission
} from '../controllers/freelanceController.js';

const router = express.Router();

router.get('/missions', getFreelanceMissions);
router.post('/missions', createFreelanceMission);

export default router;
