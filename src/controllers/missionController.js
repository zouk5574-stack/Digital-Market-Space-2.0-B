import { missionService } from '../services/missionService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validate, missionSchema } from '../utils/validators.js';
import { log } from '../utils/logger.js';

export const missionController = {
  // Créer une mission
  createMission: [
    validate(missionSchema),
    asyncHandler(async (req, res) => {
      const missionData = req.validatedData;
      const userId = req.user.id;

      const mission = await missionService.createMission(missionData, userId);
      
      res.status(201).json({
        success: true,
        message: 'Mission créée avec succès',
        data: mission
      });
    })
  ],

  // Récupérer une mission
  getMission: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user?.id; // Optionnel pour les utilisateurs non connectés

    const mission = await missionService.getMissionById(id, userId);
    
    res.json({
      success: true,
      data: mission
    });
  }),

  // Lister les missions
  getMissions: asyncHandler(async (req, res) => {
    const { 
      page = 1, 
      limit = 10, 
      category, 
      minBudget, 
      maxBudget,
      userId 
    } = req.query;

    const filters = {
      ...(category && { category }),
      ...(minBudget && { minBudget: parseInt(minBudget) }),
      ...(maxBudget && { maxBudget: parseInt(maxBudget) }),
      ...(userId && { userId })
    };

    const result = await missionService.getMissions(filters, parseInt(page), parseInt(limit));
    
    res.json({
      success: true,
      data: result.missions,
      pagination: result.pagination
    });
  }),

  // Mettre à jour une mission
  updateMission: [
    validate(missionSchema),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const updateData = req.validatedData;
      const userId = req.user.id;

      const mission = await missionService.updateMission(id, updateData, userId);
      
      res.json({
        success: true,
        message: 'Mission mise à jour avec succès',
        data: mission
      });
    })
  ],

  // Supprimer une mission
  deleteMission: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await missionService.deleteMission(id, userId);
    
    res.json({
      success: true,
      message: result.message
    });
  }),

  // Mes missions (pour l'utilisateur connecté)
  getMyMissions: asyncHandler(async (req, res) => {
    const { 
      page = 1, 
      limit = 10,
      status 
    } = req.query;
    const userId = req.user.id;

    const filters = {
      userId,
      ...(status && { status })
    };

    const result = await missionService.getMissions(filters, parseInt(page), parseInt(limit));
    
    res.json({
      success: true,
      data: result.missions,
      pagination: result.pagination
    });
  })
};