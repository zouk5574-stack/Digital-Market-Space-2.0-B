const missionService = require('../services/missionService');
const orderService = require('../services/orderService');
const walletService = require('../services/walletService');
const notificationService = require('../services/notificationService');
const { Response, Error } = require('../utils/helpers');
const logger = require('../utils/logger');

class FreelanceController {
  
  // === MISSIONS FREELANCE ===
  
  async createMission(req, res) {
    try {
      const missionData = req.body;
      const buyerId = req.user.id;

      logger.info('Création de mission freelance', { buyerId, missionData });

      const result = await missionService.createMission(missionData, buyerId);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.status(201).json(result);

    } catch (error) {
      logger.error('Erreur création mission freelance', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la création de la mission'));
    }
  }

  async publishMission(req, res) {
    try {
      const { missionId } = req.params;
      const buyerId = req.user.id;

      logger.info('Publication de mission', { missionId, buyerId });

      const result = await missionService.publishMission(missionId, buyerId);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);

    } catch (error) {
      logger.error('Erreur publication mission', {
        userId: req.user.id,
        missionId: req.params.missionId,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la publication de la mission'));
    }
  }

  async applyToMission(req, res) {
    try {
      const { missionId } = req.params;
      const applicationData = req.body;
      const sellerId = req.user.id;

      logger.info('Candidature à mission', { missionId, sellerId });

      const result = await missionService.applyToMission(missionId, applicationData, sellerId);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      // Notification à l'acheteur
      await notificationService.sendApplicationNotification(
        missionId, 
        sellerId, 
        applicationData
      );

      res.status(201).json(result);

    } catch (error) {
      logger.error('Erreur candidature mission', {
        userId: req.user.id,
        missionId: req.params.missionId,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la candidature'));
    }
  }

  async getMissionApplications(req, res) {
    try {
      const { missionId } = req.params;
      const buyerId = req.user.id;

      logger.debug('Récupération candidatures mission', { missionId, buyerId });

      const result = await missionService.getMissionApplications(missionId, buyerId);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);

    } catch (error) {
      logger.error('Erreur récupération candidatures', {
        userId: req.user.id,
        missionId: req.params.missionId,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la récupération des candidatures'));
    }
  }

  async acceptApplication(req, res) {
    try {
      const { applicationId } = req.params;
      const buyerId = req.user.id;

      logger.info('Acceptation candidature', { applicationId, buyerId });

      const result = await missionService.acceptApplication(applicationId, buyerId);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);

    } catch (error) {
      logger.error('Erreur acceptation candidature', {
        userId: req.user.id,
        applicationId: req.params.applicationId,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de l\'acceptation de la candidature'));
    }
  }

  // === COMMANDES FREELANCE ===

  async createOrder(req, res) {
    try {
      const orderData = req.body;
      const buyerId = req.user.id;

      logger.info('Création commande freelance', { buyerId, orderData });

      const result = await orderService.createOrder(orderData, buyerId);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.status(201).json(result);

    } catch (error) {
      logger.error('Erreur création commande', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la création de la commande'));
    }
  }

  async startOrder(req, res) {
    try {
      const { orderId } = req.params;
      const sellerId = req.user.id;

      logger.info('Démarrage commande', { orderId, sellerId });

      const result = await orderService.updateOrderStatus(
        orderId, 
        'in_progress', 
        sellerId
      );
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);

    } catch (error) {
      logger.error('Erreur démarrage commande', {
        userId: req.user.id,
        orderId: req.params.orderId,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors du démarrage de la commande'));
    }
  }

  async submitDelivery(req, res) {
    try {
      const { orderId } = req.params;
      const { delivery_files, delivery_notes } = req.body;
      const sellerId = req.user.id;

      logger.info('Soumission livrable', { orderId, sellerId });

      // Mettre à jour la commande avec les livrables
      const result = await orderService.updateOrder(
        orderId,
        {
          delivery_files,
          delivery_notes,
          status: 'awaiting_review',
          delivered_at: new Date().toISOString()
        },
        sellerId
      );
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);

    } catch (error) {
      logger.error('Erreur soumission livrable', {
        userId: req.user.id,
        orderId: req.params.orderId,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la soumission du livrable'));
    }
  }

  async approveDelivery(req, res) {
    try {
      const { orderId } = req.params;
      const buyerId = req.user.id;

      logger.info('Approbation livrable', { orderId, buyerId });

      const result = await orderService.updateOrderStatus(
        orderId, 
        'completed', 
        buyerId
      );
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      // Libérer les fonds au vendeur
      const order = result.data;
      await walletService.releaseOrderFunds(orderId, order.seller_id, order.seller_amount);

      res.json(result);

    } catch (error) {
      logger.error('Erreur approbation livrable', {
        userId: req.user.id,
        orderId: req.params.orderId,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de l\'approbation du livrable'));
    }
  }

  async requestRevision(req, res) {
    try {
      const { orderId } = req.params;
      const { revision_notes } = req.body;
      const buyerId = req.user.id;

      logger.info('Demande révision', { orderId, buyerId });

      const result = await orderService.updateOrderStatus(
        orderId, 
        'revision_requested', 
        buyerId,
        revision_notes
      );
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);

    } catch (error) {
      logger.error('Erreur demande révision', {
        userId: req.user.id,
        orderId: req.params.orderId,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la demande de révision'));
    }
  }

  // === STATISTIQUES FREELANCE ===

  async getFreelancerStats(req, res) {
    try {
      const sellerId = req.user.id;

      logger.debug('Récupération statistiques freelance', { sellerId });

      // Récupérer les statistiques des commandes
      const orderStats = await orderService.getOrderStats(sellerId);
      
      // Récupérer les statistiques du portefeuille
      const wallet = await walletService.getUserWallet(sellerId);

      const stats = {
        orders: orderStats.success ? orderStats.data : {},
        wallet: wallet.success ? wallet.data : {},
        performance: await this.calculatePerformanceStats(sellerId)
      };

      res.json(Response.success(stats, 'Statistiques récupérées avec succès'));

    } catch (error) {
      logger.error('Erreur récupération statistiques freelance', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la récupération des statistiques'));
    }
  }

  async getFreelancerProfile(req, res) {
    try {
      const { id } = req.params;
      const currentUserId = req.user.id;

      logger.debug('Récupération profil freelance', { profileId: id, currentUserId });

      // Récupérer le profil utilisateur
      const userProfile = await this.getUserProfile(id);
      
      if (!userProfile) {
        return res.status(404).json(Response.error('Profil non trouvé'));
      }

      // Récupérer les statistiques spécifiques au freelance
      const stats = await this.getFreelancerPublicStats(id);

      const profile = {
        ...userProfile,
        stats,
        // Masquer les informations sensibles pour les autres utilisateurs
        ...(id !== currentUserId && {
          email: undefined,
          phone: undefined,
          balance: undefined
        })
      };

      res.json(Response.success(profile, 'Profil freelance récupéré avec succès'));

    } catch (error) {
      logger.error('Erreur récupération profil freelance', {
        userId: req.user.id,
        profileId: req.params.id,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la récupération du profil'));
    }
  }

  async updateFreelancerProfile(req, res) {
    try {
      const updates = req.body;
      const userId = req.user.id;

      logger.info('Mise à jour profil freelance', { userId, updates });

      // Mettre à jour le profil dans la base de données
      const result = await this.updateUserProfile(userId, updates);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(Response.success(result.data, 'Profil mis à jour avec succès'));

    } catch (error) {
      logger.error('Erreur mise à jour profil freelance', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la mise à jour du profil'));
    }
  }

  // === MÉTHODES HELPER INTERNES ===

  async calculatePerformanceStats(sellerId) {
    try {
      // Calculer le taux de réponse
      const responseRate = await this.calculateResponseRate(sellerId);
      
      // Calculer le taux de complétion
      const completionRate = await this.calculateCompletionRate(sellerId);
      
      // Temps moyen de livraison
      const avgDeliveryTime = await this.calculateAverageDeliveryTime(sellerId);

      return {
        response_rate: responseRate,
        completion_rate: completionRate,
        average_delivery_time: avgDeliveryTime,
        customer_satisfaction: await this.calculateSatisfactionRate(sellerId)
      };

    } catch (error) {
      logger.error('Erreur calcul performances', { sellerId, error: error.message });
      return {};
    }
  }

  async calculateResponseRate(sellerId) {
    // Implémentation du calcul du taux de réponse
    try {
      const { data: applications } = await database.client
        .from('mission_applications')
        .select('created_at')
        .eq('seller_id', sellerId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (!applications || applications.length === 0) return 0;

      // Logique simplifiée - à améliorer
      return 95; // Pourcentage
    } catch (error) {
      return 0;
    }
  }

  async calculateCompletionRate(sellerId) {
    // Implémentation du taux de complétion
    try {
      const { data: orders } = await database.client
        .from('orders')
        .select('status')
        .eq('seller_id', sellerId);

      if (!orders || orders.length === 0) return 0;

      const completed = orders.filter(order => order.status === 'completed').length;
      return Math.round((completed / orders.length) * 100);
    } catch (error) {
      return 0;
    }
  }

  async calculateAverageDeliveryTime(sellerId) {
    // Implémentation du temps moyen de livraison
    try {
      const { data: orders } = await database.client
        .from('orders')
        .select('created_at, completed_at')
        .eq('seller_id', sellerId)
        .eq('status', 'completed');

      if (!orders || orders.length === 0) return 0;

      const totalTime = orders.reduce((sum, order) => {
        const start = new Date(order.created_at);
        const end = new Date(order.completed_at);
        return sum + (end - start);
      }, 0);

      return Math.round(totalTime / orders.length / (1000 * 60 * 60 * 24)); // En jours
    } catch (error) {
      return 0;
    }
  }

  async calculateSatisfactionRate(sellerId) {
    // Implémentation du taux de satisfaction
    // Pour l'instant, retourner une valeur par défaut
    return 4.5; // Sur 5
  }

  async getUserProfile(userId) {
    try {
      const { data: user, error } = await database.client
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      return user;
    } catch (error) {
      logger.error('Erreur récupération profil utilisateur', { userId, error: error.message });
      return null;
    }
  }

  async updateUserProfile(userId, updates) {
    try {
      const { data: user, error } = await database.client
        .from('users')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      return Response.success(user, 'Profil mis à jour avec succès');
    } catch (error) {
      return Response.error('Erreur lors de la mise à jour du profil');
    }
  }

  async getFreelancerPublicStats(userId) {
    try {
      const { data: user } = await database.client
        .from('users')
        .select('completed_orders, rating, response_rate')
        .eq('id', userId)
        .single();

      const { data: recentOrders } = await database.client
        .from('orders')
        .select('id, status, amount')
        .eq('seller_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      return {
        completed_orders: user?.completed_orders || 0,
        rating: user?.rating || 0,
        response_rate: user?.response_rate || 0,
        recent_activity: recentOrders?.length || 0,
        total_earnings: recentOrders?.reduce((sum, order) => sum + (order.amount || 0), 0) || 0
      };
    } catch (error) {
      logger.error('Erreur récupération stats publiques', { userId, error: error.message });
      return {};
    }
  }
}

module.exports = new FreelanceController();