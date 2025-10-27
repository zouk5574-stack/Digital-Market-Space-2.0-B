const express = require('express');
const router = express.Router();
const missionController = require('../controllers/freelanceController');
const { validateRequest } = require('../middleware/validationMiddleware');
const { schemas } = require('../middleware/validationMiddleware');
const authMiddleware = require('../middleware/authMiddleware');

// Routes pour les acheteurs (création et gestion des missions)
router.post('/',
  authMiddleware.authenticateToken,
  validateRequest(schemas.mission.create),
  missionController.createMission
);

router.put('/:missionId/publish',
  authMiddleware.authenticateToken,
  missionController.publishMission
);

router.get('/:missionId/applications',
  authMiddleware.authenticateToken,
  missionController.getMissionApplications
);

router.post('/:missionId/applications/:applicationId/accept',
  authMiddleware.authenticateToken,
  missionController.acceptApplication
);

// Routes pour les vendeurs (candidatures)
router.post('/:missionId/apply',
  authMiddleware.authenticateToken,
  validateRequest(schemas.mission.apply),
  missionController.applyToMission
);

// Routes publiques (consultation des missions)
router.get('/',
  missionController.getMissions
);

router.get('/:missionId',
  missionController.getMissionById
);

// Routes de gestion des missions
router.put('/:missionId',
  authMiddleware.authenticateToken,
  validateRequest(schemas.mission.update),
  missionController.updateMission
);

router.delete('/:missionId',
  authMiddleware.authenticateToken,
  missionController.cancelMission
);

// Routes statistiques missions
router.get('/user/buyer',
  authMiddleware.authenticateToken,
  missionController.getBuyerMissions
);

router.get('/user/seller',
  authMiddleware.authenticateToken,
  missionController.getSellerMissions
);

module.exports = router;