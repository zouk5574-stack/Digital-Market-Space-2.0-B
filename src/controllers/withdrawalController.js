const withdrawalService = require('../services/withdrawalService');
const { Response, Error } = require('../utils/helpers');
const logger = require('../utils/logger');

class WithdrawalController {
  
  async createWithdrawal(req, res) {
    try {
      const withdrawalData = req.body;
      const userId = req.user.id;

      logger.info('Création demande de retrait', { userId, withdrawalData });

      const result = await withdrawalService.createWithdrawal(withdrawalData, userId);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.status(201).json(result);

    } catch (error) {
      logger.error('Erreur création demande retrait', {
        userId: req.user.id,
        error: error.message,
        withdrawalData: req.body
      });

      res.status(500).json(Response.error('Erreur lors de la création de la demande de retrait'));
    }
  }

  async getUserWithdrawals(req, res) {
    try {
      const userId = req.user.id;
      const filters = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        status: req.query.status
      };

      logger.debug('Récupération historique retraits', { userId, filters });

      const result = await withdrawalService.getUserWithdrawals(userId, filters);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);

    } catch (error) {
      logger.error('Erreur récupération historique retraits', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la récupération de l\'historique des retraits'));
    }
  }

  async cancelWithdrawal(req, res) {
    try {
      const { withdrawalId } = req.params;
      const userId = req.user.id;

      logger.info('Annulation demande de retrait', { withdrawalId, userId });

      const result = await withdrawalService.cancelWithdrawal(withdrawalId, userId);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);

    } catch (error) {
      logger.error('Erreur annulation retrait', {
        userId: req.user.id,
        withdrawalId: req.params.withdrawalId,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de l\'annulation du retrait'));
    }
  }

  async getWithdrawalStats(req, res) {
    try {
      const userId = req.user.id;

      logger.debug('Récupération statistiques retraits', { userId });

      const result = await withdrawalService.getWithdrawalStats(userId);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);

    } catch (error) {
      logger.error('Erreur récupération statistiques retraits', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la récupération des statistiques de retrait'));
    }
  }
}

module.exports = new WithdrawalController();