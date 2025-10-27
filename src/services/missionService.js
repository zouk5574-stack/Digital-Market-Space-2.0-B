const database = require('../config/database');
const logger = require('../utils/logger');
const { Response, Error, Financial, Date } = require('../utils/helpers');
const constants = require('../utils/constants');

class MissionService {
  constructor() {
    this.table = 'missions';
    this.applicationsTable = 'mission_applications';
  }

  async createMission(missionData, buyerId) {
    const transactionId = `mission_create_${Date.now()}`;
    
    try {
      logger.info(`Création de mission: ${transactionId}`, { buyerId, missionData });

      const { title, description, budget, category, deadline, tags, attachments } = missionData;

      // Validation du budget
      if (!Financial.validateAmount(budget)) {
        throw new Error(`Budget invalide. Doit être entre ${constants.LIMITS.MIN_MISSION_BUDGET} et ${constants.LIMITS.MAX_MISSION_BUDGET} FCFA`);
      }

      const mission = {
        title: title.trim(),
        description: description.trim(),
        budget: Financial.formatAmount(budget),
        category,
        deadline: new Date(deadline).toISOString(),
        tags: tags || [],
        attachments: attachments || [],
        buyer_id: buyerId,
        status: constants.MISSION_STATUS.DRAFT,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const result = await database.safeInsert(this.table, mission);
      
      logger.info(`Mission créée avec succès: ${transactionId}`, {
        missionId: result.id,
        buyerId,
        title: mission.title,
        budget: mission.budget
      });

      return Response.success(result, 'Mission créée avec succès');

    } catch (err) {
      const handledError = Error.handleServiceError(err, 'MissionService.createMission', {
        transactionId,
        buyerId,
        missionData
      });
      
      logger.error(`Échec création mission: ${transactionId}`, {
        error: handledError.message,
        buyerId
      });
      
      return Response.error(handledError.message);
    }
  }

  async publishMission(missionId, buyerId) {
    const transactionId = `mission_publish_${missionId}_${Date.now()}`;
    
    try {
      logger.info(`Publication de mission: ${transactionId}`, { missionId, buyerId });

      // Vérifier que la mission existe et appartient à l'acheteur
      const mission = await database.safeSelect(this.table, { id: missionId }, { single: true });

      if (!mission) {
        throw new Error('Mission non trouvée');
      }

      if (mission.buyer_id !== buyerId) {
        throw new Error('Non autorisé à publier cette mission');
      }

      if (mission.status !== constants.MISSION_STATUS.DRAFT) {
        throw new Error('Seules les missions en brouillon peuvent être publiées');
      }

      // Vérifier que la date limite est dans le futur
      if (Date.isPast(mission.deadline)) {
        throw new Error('La date limite doit être dans le futur');
      }

      const result = await database.safeUpdate(
        this.table, 
        { 
          status: constants.MISSION_STATUS.PUBLISHED,
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, 
        { id: missionId }
      );

      logger.info(`Mission publiée avec succès: ${transactionId}`, {
        missionId,
        buyerId,
        title: mission.title
      });

      return Response.success(result, 'Mission publiée avec succès');

    } catch (err) {
      const handledError = Error.handleServiceError(err, 'MissionService.publishMission', {
        transactionId,
        missionId,
        buyerId
      });
      
      logger.error(`Échec publication mission: ${transactionId}`, {
        error: handledError.message
      });
      
      return Response.error(handledError.message);
    }
  }

  async applyToMission(missionId, applicationData, sellerId) {
    const transactionId = `mission_apply_${missionId}_${Date.now()}`;
    
    try {
      logger.info(`Candidature à mission: ${transactionId}`, { missionId, sellerId, applicationData });

      const { proposal, bid_amount, delivery_time } = applicationData;

      // Vérifier que la mission existe et est publiée
      const mission = await database.safeSelect(this.table, { id: missionId }, { single: true });

      if (!mission) {
        throw new Error('Mission non trouvée');
      }

      if (mission.status !== constants.MISSION_STATUS.PUBLISHED) {
        throw new Error('Mission non disponible pour candidature');
      }

      // Vérifier que le vendeur ne postule pas à sa propre mission
      if (mission.buyer_id === sellerId) {
        throw new Error('Vous ne pouvez pas postuler à votre propre mission');
      }

      // Vérifier que la date limite n'est pas dépassée
      if (Date.isPast(mission.deadline)) {
        throw new Error('La date limite de candidature est dépassée');
      }

      // Vérifier que le vendeur n'a pas déjà postulé
      const existingApplication = await database.safeSelect(
        this.applicationsTable, 
        { mission_id: missionId, seller_id: sellerId }, 
        { single: true }
      );

      if (existingApplication) {
        throw new Error('Vous avez déjà postulé à cette mission');
      }

      // Validation du montant de l'offre
      if (!Financial.validateAmount(bid_amount)) {
        throw new Error('Montant de l\'offre invalide');
      }

      const application = {
        mission_id: missionId,
        seller_id: sellerId,
        proposal: proposal.trim(),
        bid_amount: Financial.formatAmount(bid_amount),
        delivery_time: parseInt(delivery_time),
        status: constants.APPLICATION_STATUS.PENDING,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const result = await database.safeInsert(this.applicationsTable, application);

      logger.info(`Candidature soumise avec succès: ${transactionId}`, {
        applicationId: result.id,
        missionId,
        sellerId,
        bidAmount: application.bid_amount
      });

      return Response.success(result, 'Candidature soumise avec succès');

    } catch (err) {
      const handledError = Error.handleServiceError(err, 'MissionService.applyToMission', {
        transactionId,
        missionId,
        sellerId,
        applicationData
      });
      
      logger.error(`Échec candidature mission: ${transactionId}`, {
        error: handledError.message
      });
      
      return Response.error(handledError.message);
    }
  }

  async getMissionApplications(missionId, buyerId) {
    try {
      logger.debug(`Récupération candidatures mission: ${missionId}`, { buyerId });

      // Vérifier que la mission existe et appartient à l'acheteur
      const mission = await database.safeSelect(this.table, { id: missionId }, { single: true });

      if (!mission) {
        throw new Error('Mission non trouvée');
      }

      if (mission.buyer_id !== buyerId) {
        throw new Error('Non autorisé à voir les candidatures de cette mission');
      }

      const applications = await database.safeSelect(
        this.applicationsTable,
        { mission_id: missionId },
        {
          fields: `
            *,
            seller:users(
              id,
              first_name,
              last_name,
              username,
              rating,
              response_rate,
              completed_orders,
              profile_data
            )
          `,
          orderBy: ['created_at:desc']
        }
      );

      return Response.success(applications, 'Candidatures récupérées avec succès');

    } catch (err) {
      const handledError = Error.handleServiceError(err, 'MissionService.getMissionApplications', {
        missionId,
        buyerId
      });
      
      return Response.error(handledError.message);
    }
  }

  async acceptApplication(applicationId, buyerId) {
    const transactionId = `application_accept_${applicationId}_${Date.now()}`;
    
    try {
      logger.info(`Acceptation candidature: ${transactionId}`, { applicationId, buyerId });

      // Récupérer la candidature avec la mission
      const application = await database.safeSelect(
        this.applicationsTable,
        { id: applicationId },
        {
          single: true,
          fields: `
            *,
            mission:missions(*)
          `
        }
      );

      if (!application) {
        throw new Error('Candidature non trouvée');
      }

      // Vérifier les permissions
      if (application.mission.buyer_id !== buyerId) {
        throw new Error('Non autorisé à accepter cette candidature');
      }

      if (application.status !== constants.APPLICATION_STATUS.PENDING) {
        throw new Error('Cette candidature a déjà été traitée');
      }

      // Vérifier que la mission est toujours disponible
      if (application.mission.status !== constants.MISSION_STATUS.PUBLISHED) {
        throw new Error('Cette mission n\'est plus disponible');
      }

      // Exécuter la transaction : accepter cette candidature et rejeter les autres
      const operations = [
        // Accepter cette candidature
        {
          table: this.applicationsTable,
          action: 'update',
          data: {
            status: constants.APPLICATION_STATUS.ACCEPTED,
            updated_at: new Date().toISOString()
          },
          conditions: { id: applicationId }
        },
        // Rejeter les autres candidatures
        {
          table: this.applicationsTable,
          action: 'update',
          data: {
            status: constants.APPLICATION_STATUS.REJECTED,
            updated_at: new Date().toISOString()
          },
          conditions: { 
            mission_id: application.mission_id,
            id: `neq.${applicationId}`
          }
        },
        // Mettre à jour la mission
        {
          table: this.table,
          action: 'update',
          data: {
            status: constants.MISSION_STATUS.IN_PROGRESS,
            assigned_seller_id: application.seller_id,
            updated_at: new Date().toISOString()
          },
          conditions: { id: application.mission_id }
        }
      ];

      const results = await database.executeTransaction(operations);

      logger.info(`Candidature acceptée avec succès: ${transactionId}`, {
        applicationId,
        missionId: application.mission_id,
        sellerId: application.seller_id,
        buyerId
      });

      return Response.success(results[0], 'Candidature acceptée avec succès. Vous pouvez maintenant créer la commande.');

    } catch (err) {
      const handledError = Error.handleServiceError(err, 'MissionService.acceptApplication', {
        transactionId,
        applicationId,
        buyerId
      });
      
      logger.error(`Échec acceptation candidature: ${transactionId}`, {
        error: handledError.message
      });
      
      return Response.error(handledError.message);
    }
  }

  async getSellerMissions(sellerId, filters = {}) {
    try {
      const { 
        page = 1, 
        limit = constants.LIMITS.DEFAULT_PAGE_LIMIT, 
        status,
        type = 'applications' // 'applications', 'assigned', 'completed'
      } = filters;

      const offset = (page - 1) * limit;

      let query;
      
      if (type === 'applications') {
        // Missions auxquelles le vendeur a postulé
        query = database.client
          .from(this.applicationsTable)
          .select(`
            *,
            mission:missions(
              *,
              buyer:users(first_name, last_name, username, rating)
            )
          `, { count: 'exact' })
          .eq('seller_id', sellerId);
      } else {
        // Missions assignées au vendeur
        query = database.client
          .from(this.table)
          .select(`
            *,
            buyer:users(first_name, last_name, username, rating),
            applications!inner(*)
          `, { count: 'exact' })
          .eq('assigned_seller_id', sellerId);
      }

      // Filtre par statut
      if (status && status !== 'all') {
        if (type === 'applications') {
          query = query.eq('status', status);
        } else {
          query = query.eq('status', status);
        }
      }

      // Tri et pagination
      query = query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      const pagination = {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count
      };

      return Response.paginated(data, pagination, 'Missions récupérées avec succès');

    } catch (err) {
      const handledError = Error.handleServiceError(err, 'MissionService.getSellerMissions', {
        sellerId,
        filters
      });
      
      return Response.error(handledError.message);
    }
  }

  async getBuyerMissions(buyerId, filters = {}) {
    try {
      const { 
        page = 1, 
        limit = constants.LIMITS.DEFAULT_PAGE_LIMIT, 
        status 
      } = filters;

      const offset = (page - 1) * limit;

      let query = database.client
        .from(this.table)
        .select(`
          *,
          applications(count),
          assigned_seller:users(first_name, last_name, username, rating)
        `, { count: 'exact' })
        .eq('buyer_id', buyerId);

      if (status && status !== 'all') {
        query = query.eq('status', status);
      }

      query = query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      const pagination = {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count
      };

      return Response.paginated(data, pagination, 'Missions récupérées avec succès');

    } catch (err) {
      const handledError = Error.handleServiceError(err, 'MissionService.getBuyerMissions', {
        buyerId,
        filters
      });
      
      return Response.error(handledError.message);
    }
  }

  async getMissionById(missionId, userId) {
    try {
      logger.debug(`Récupération mission: ${missionId}`, { userId });

      const mission = await database.safeSelect(
        this.table,
        { id: missionId },
        { 
          single: true,
          fields: `
            *,
            buyer:users(first_name, last_name, username, rating),
            assigned_seller:users(first_name, last_name, username, rating),
            applications(count)
          `
        }
      );

      if (!mission) {
        throw new Error('Mission non trouvée');
      }

      // Vérifier les permissions (acheteur ou vendeur assigné)
      const isBuyer = mission.buyer_id === userId;
      const isAssignedSeller = mission.assigned_seller_id === userId;
      
      if (!isBuyer && !isAssignedSeller) {
        // Pour les autres utilisateurs, ne montrer que les missions publiées
        if (mission.status !== constants.MISSION_STATUS.PUBLISHED) {
          throw new Error('Accès non autorisé à cette mission');
        }
      }

      return Response.success(mission, 'Mission récupérée avec succès');

    } catch (err) {
      const handledError = Error.handleServiceError(err, 'MissionService.getMissionById', {
        missionId,
        userId
      });
      
      return Response.error(handledError.message);
    }
  }

  async updateMission(missionId, updates, buyerId) {
    try {
      logger.debug(`Mise à jour mission: ${missionId}`, { buyerId, updates });

      // Vérifier que la mission existe et appartient à l'acheteur
      const mission = await database.safeSelect(this.table, { id: missionId }, { single: true });

      if (!mission) {
        throw new Error('Mission non trouvée');
      }

      if (mission.buyer_id !== buyerId) {
        throw new Error('Non autorisé à modifier cette mission');
      }

      // Ne pas permettre la modification si la mission est en cours
      if (mission.status === constants.MISSION_STATUS.IN_PROGRESS) {
        throw new Error('Impossible de modifier une mission en cours');
      }

      // Nettoyer les updates
      const allowedUpdates = [
        'title', 'description', 'budget', 'category', 'deadline', 'tags', 'attachments'
      ];
      
      const cleanUpdates = {};
      Object.keys(updates).forEach(key => {
        if (allowedUpdates.includes(key)) {
          cleanUpdates[key] = updates[key];
        }
      });

      if (Object.keys(cleanUpdates).length === 0) {
        throw new Error('Aucune donnée valide à mettre à jour');
      }

      cleanUpdates.updated_at = new Date().toISOString();

      const result = await database.safeUpdate(this.table, cleanUpdates, { id: missionId });

      logger.info(`Mission mise à jour: ${missionId}`, {
        buyerId,
        updates: Object.keys(cleanUpdates)
      });

      return Response.success(result, 'Mission mise à jour avec succès');

    } catch (err) {
      const handledError = Error.handleServiceError(err, 'MissionService.updateMission', {
        missionId,
        buyerId,
        updates
      });
      
      return Response.error(handledError.message);
    }
  }

  async cancelMission(missionId, buyerId, reason) {
    const transactionId = `mission_cancel_${missionId}_${Date.now()}`;
    
    try {
      logger.info(`Annulation mission: ${transactionId}`, { missionId, buyerId, reason });

      // Vérifier que la mission existe et appartient à l'acheteur
      const mission = await database.safeSelect(this.table, { id: missionId }, { single: true });

      if (!mission) {
        throw new Error('Mission non trouvée');
      }

      if (mission.buyer_id !== buyerId) {
        throw new Error('Non autorisé à annuler cette mission');
      }

      // Ne pas permettre l'annulation si la mission est complétée
      if (mission.status === constants.MISSION_STATUS.COMPLETED) {
        throw new Error('Impossible d\'annuler une mission complétée');
      }

      const operations = [
        // Annuler la mission
        {
          table: this.table,
          action: 'update',
          data: {
            status: constants.MISSION_STATUS.CANCELLED,
            cancellation_reason: reason,
            cancelled_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          conditions: { id: missionId }
        }
      ];

      // Si la mission avait un vendeur assigné, rejeter sa candidature
      if (mission.assigned_seller_id) {
        operations.push({
          table: this.applicationsTable,
          action: 'update',
          data: {
            status: constants.APPLICATION_STATUS.REJECTED,
            updated_at: new Date().toISOString()
          },
          conditions: { 
            mission_id: missionId,
            seller_id: mission.assigned_seller_id
          }
        });
      }

      const results = await database.executeTransaction(operations);

      logger.info(`Mission annulée avec succès: ${transactionId}`, {
        missionId,
        buyerId,
        reason
      });

      return Response.success(results[0], 'Mission annulée avec succès');

    } catch (err) {
      const handledError = Error.handleServiceError(err, 'MissionService.cancelMission', {
        transactionId,
        missionId,
        buyerId,
        reason
      });
      
      logger.error(`Échec annulation mission: ${transactionId}`, {
        error: handledError.message
      });
      
      return Response.error(handledError.message);
    }
  }
}

module.exports = new MissionService();