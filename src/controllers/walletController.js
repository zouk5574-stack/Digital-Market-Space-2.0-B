const walletService = require('../services/walletService');
const { Response, Error } = require('../utils/helpers');
const logger = require('../utils/logger');

class WalletController {
  
  async getUserWallet(req, res) {
    try {
      const userId = req.user.id;

      logger.debug('Récupération portefeuille utilisateur', { userId });

      const result = await walletService.getUserWallet(userId);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);

    } catch (error) {
      logger.error('Erreur récupération portefeuille', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la récupération du portefeuille'));
    }
  }

  async addFunds(req, res) {
    try {
      const { amount, source, metadata } = req.body;
      const userId = req.user.id;

      logger.info('Ajout de fonds au portefeuille', { userId, amount, source });

      const result = await walletService.addFunds(userId, amount, source, metadata);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.status(201).json(result);

    } catch (error) {
      logger.error('Erreur ajout de fonds', {
        userId: req.user.id,
        amount: req.body.amount,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de l\'ajout de fonds'));
    }
  }

  async getTransactionHistory(req, res) {
    try {
      const userId = req.user.id;
      const filters = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        type: req.query.type,
        status: req.query.status,
        start_date: req.query.start_date,
        end_date: req.query.end_date
      };

      logger.debug('Récupération historique transactions', { userId, filters });

      const result = await walletService.getTransactionHistory(userId, filters);
      
      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);

    } catch (error) {
      logger.error('Erreur récupération historique transactions', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la récupération de l\'historique'));
    }
  }

  async getWalletStats(req, res) {
    try {
      const userId = req.user.id;

      logger.debug('Récupération statistiques portefeuille', { userId });

      const wallet = await walletService.getUserWallet(userId);
      
      if (!wallet.success) {
        return res.status(400).json(wallet);
      }

      const stats = {
        current_balance: wallet.data.balance,
        available_balance: wallet.data.available_balance,
        pending_balance: wallet.data.pending_balance,
        total_earnings: wallet.data.stats.total_earnings,
        completed_orders: wallet.data.stats.completed_orders,
        average_order_value: wallet.data.stats.average_order_value
      };

      res.json(Response.success(stats, 'Statistiques portefeuille récupérées'));

    } catch (error) {
      logger.error('Erreur récupération statistiques portefeuille', {
        userId: req.user.id,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la récupération des statistiques'));
    }
  }
}

module.exports = new WalletController();