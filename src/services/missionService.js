import { supabase } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { log } from '../utils/logger.js';

export class MissionService {
  // Créer une mission
  async createMission(missionData, userId) {
    try {
      const { data: mission, error } = await supabase
        .from('missions')
        .insert({
          ...missionData,
          user_id: userId,
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select(`
          *,
          user:users(id, first_name, last_name, username, rating)
        `)
        .single();

      if (error) {
        log.error('Erreur création mission', { error, userId, missionData });
        throw new AppError(`Erreur création mission: ${error.message}`, 400);
      }

      log.info('Mission créée avec succès', { missionId: mission.id, userId });
      return mission;
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.error('Erreur inattendue création mission', { error, userId });
      throw new AppError('Erreur lors de la création de la mission', 500);
    }
  }

  // Récupérer une mission par ID
  async getMissionById(missionId, userId = null) {
    try {
      let query = supabase
        .from('missions')
        .select(`
          *,
          user:users(id, first_name, last_name, username, rating, response_rate),
          offers(count),
          orders(count)
        `)
        .eq('id', missionId)
        .single();

      const { data: mission, error } = await query;

      if (error) {
        if (error.code === 'PGRST116') {
          throw new AppError('Mission non trouvée', 404);
        }
        throw new AppError(`Erreur récupération mission: ${error.message}`, 400);
      }

      // Vérification des permissions si userId fourni
      if (userId && mission.user_id !== userId) {
        // Log pour audit mais pas d'erreur (lecture seule)
        log.info('Accès mission par utilisateur non propriétaire', { 
          missionId, 
          userId, 
          ownerId: mission.user_id 
        });
      }

      return mission;
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.error('Erreur récupération mission', { error, missionId });
      throw new AppError('Erreur lors de la récupération de la mission', 500);
    }
  }

  // Lister les missions avec pagination et filtres
  async getMissions(filters = {}, page = 1, limit = 10) {
    try {
      const offset = (page - 1) * limit;
      
      let query = supabase
        .from('missions')
        .select(`
          *,
          user:users(id, first_name, last_name, username, rating),
          offers(count)
        `, { count: 'exact' })
        .eq('status', 'pending') // Seulement les missions actives par défaut
        .order('created_at', { ascending: false });

      // Application des filtres
      if (filters.category) {
        query = query.eq('category', filters.category);
      }
      if (filters.minBudget) {
        query = query.gte('budget', filters.minBudget);
      }
      if (filters.maxBudget) {
        query = query.lte('budget', filters.maxBudget);
      }
      if (filters.userId) {
        query = query.eq('user_id', filters.userId);
      }

      // Pagination
      query = query.range(offset, offset + limit - 1);

      const { data: missions, error, count } = await query;

      if (error) {
        log.error('Erreur récupération liste missions', { error, filters });
        throw new AppError(`Erreur récupération missions: ${error.message}`, 400);
      }

      return {
        missions: missions || [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit)
        }
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.error('Erreur inattendue récupération missions', { error });
      throw new AppError('Erreur lors de la récupération des missions', 500);
    }
  }

  // Mettre à jour une mission
  async updateMission(missionId, updateData, userId) {
    try {
      // Vérification que l'utilisateur est le propriétaire
      const { data: existingMission, error: checkError } = await supabase
        .from('missions')
        .select('user_id, status')
        .eq('id', missionId)
        .single();

      if (checkError) {
        throw new AppError('Mission non trouvée', 404);
      }

      if (existingMission.user_id !== userId) {
        throw new AppError('Non autorisé à modifier cette mission', 403);
      }

      if (existingMission.status !== 'pending') {
        throw new AppError('Impossible de modifier une mission en cours ou terminée', 400);
      }

      const { data: mission, error } = await supabase
        .from('missions')
        .update({
          ...updateData,
          updated_at: new Date().toISOString()
        })
        .eq('id', missionId)
        .select()
        .single();

      if (error) {
        log.error('Erreur mise à jour mission', { error, missionId, userId });
        throw new AppError(`Erreur mise à jour mission: ${error.message}`, 400);
      }

      log.info('Mission mise à jour avec succès', { missionId, userId });
      return mission;
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.error('Erreur inattendue mise à jour mission', { error, missionId });
      throw new AppError('Erreur lors de la mise à jour de la mission', 500);
    }
  }

  // Supprimer une mission (soft delete)
  async deleteMission(missionId, userId) {
    try {
      const { data: existingMission, error: checkError } = await supabase
        .from('missions')
        .select('user_id, status')
        .eq('id', missionId)
        .single();

      if (checkError) {
        throw new AppError('Mission non trouvée', 404);
      }

      if (existingMission.user_id !== userId) {
        throw new AppError('Non autorisé à supprimer cette mission', 403);
      }

      const { error } = await supabase
        .from('missions')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', missionId);

      if (error) {
        log.error('Erreur suppression mission', { error, missionId, userId });
        throw new AppError(`Erreur suppression mission: ${error.message}`, 400);
      }

      log.info('Mission supprimée avec succès', { missionId, userId });
      return { success: true, message: 'Mission supprimée avec succès' };
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.error('Erreur inattendue suppression mission', { error, missionId });
      throw new AppError('Erreur lors de la suppression de la mission', 500);
    }
  }
}

export const missionService = new MissionService();