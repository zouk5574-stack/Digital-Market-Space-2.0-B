// backend/routes/missionRoutes.js

import express from 'express';
// Assurez-vous d'importer la fonction de contrôleur
import { assignSellerToMission } from '../controllers/missionController.js';
// Assurez-vous d'importer le middleware d'authentification
import { protect } from '../middlewares/authMiddleware.js'; 

const router = express.Router();

// POST /api/missions/:missionId/assign
// Nécessite une authentification (protect) pour s'assurer que l'utilisateur est connecté et est l'acheteur.
router.post(
    '/:missionId/assign', 
    protect, // Middleware d'authentification (doit fournir req.user.db.id)
    assignSellerToMission
);

export default router;
