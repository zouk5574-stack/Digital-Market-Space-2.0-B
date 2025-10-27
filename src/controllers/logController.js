const database = require('../config/database');
const { Response, Error } = require('../utils/helpers');
const logger = require('../utils/logger');

class LogController {
  
  async getSystemLogs(req, res) {
    try {
      const { 
        page = 1, 
        limit = 50, 
        level, 
        start_date, 
        end_date,
        search 
      } = req.query;

      const offset = (page - 1) * limit;
      const adminId = req.user.id;

      logger.info('Récupération logs système', { adminId });

      let query = database.client
        .from('system_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      // Appliquer les filtres
      if (level) {
        query = query.eq('level', level);
      }

      if (start_date) {
        query = query.gte('created_at', new Date(start_date).toISOString());
      }

      if (end_date) {
        query = query.lte('created_at', new Date(end_date).toISOString());
      }

      if (search) {
        query = query.or(`message.ilike.%${search}%,context.ilike.%${search}%`);
      }

      query = query.range(offset, offset + limit - 1);

      const { data: logs, error, count } = await query;

      if (error) throw error;

      const pagination = {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count
      };

      res.json(Response.paginated(logs, pagination, 'Logs système récupérés'));

    } catch (error) {
      logger.error('Erreur récupération logs système', {
        adminId: req.user.id,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la récupération des logs'));
    }
  }

  async getAuditLogs(req, res) {
    try {
      const { 
        page = 1, 
        limit = 50, 
        action,
        user_id,
        start_date,
        end_date 
      } = req.query;

      const offset = (page - 1) * limit;
      const adminId = req.user.id;

      logger.info('Récupération logs audit', { adminId });

      let query = database.client
        .from('audit_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (action) {
        query = query.eq('action', action);
      }

      if (user_id) {
        query = query.eq('user_id', user_id);
      }

      if (start_date) {
        query = query.gte('created_at', new Date(start_date).toISOString());
      }

      if (end_date) {
        query = query.lte('created_at', new Date(end_date).toISOString());
      }

      query = query.range(offset, offset + limit - 1);

      const { data: logs, error, count } = await query;

      if (error) throw error;

      const pagination = {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count
      };

      res.json(Response.paginated(logs, pagination, 'Logs audit récupérés'));

    } catch (error) {
      logger.error('Erreur récupération logs audit', {
        adminId: req.user.id,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la récupération des logs audit'));
    }
  }

  async getUserActivityLogs(req, res) {
    try {
      const { userId } = req.params;
      const { 
        page = 1, 
        limit = 30,
        action_type 
      } = req.query;

      const offset = (page - 1) * limit;
      const adminId = req.user.id;

      logger.info('Récupération logs activité utilisateur', { adminId, userId });

      let query = database.client
        .from('user_activity_logs')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (action_type) {
        query = query.eq('action_type', action_type);
      }

      query = query.range(offset, offset + limit - 1);

      const { data: logs, error, count } = await query;

      if (error) throw error;

      const pagination = {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count
      };

      res.json(Response.paginated(logs, pagination, 'Logs activité utilisateur récupérés'));

    } catch (error) {
      logger.error('Erreur récupération logs activité utilisateur', {
        adminId: req.user.id,
        userId: req.params.userId,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de la récupération des logs d\'activité'));
    }
  }

  async exportLogs(req, res) {
    try {
      const { type, format = 'json' } = req.query;
      const adminId = req.user.id;

      logger.info('Export logs demandé', { adminId, type, format });

      // Générer les logs selon le type
      const logs = await this.generateExportLogs(type);
      
      if (format === 'csv') {
        const csvData = this.convertToCSV(logs);
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=logs_${type}_${new Date().toISOString().split('T')[0]}.csv`);
        
        return res.send(csvData);
      }

      res.json(Response.success(logs, 'Logs exportés avec succès'));

    } catch (error) {
      logger.error('Erreur export logs', {
        adminId: req.user.id,
        error: error.message
      });

      res.status(500).json(Response.error('Erreur lors de l\'export des logs'));
    }
  }

  // Méthodes helper internes
  async generateExportLogs(type) {
    try {
      let query;
      
      switch (type) {
        case 'system':
          query = database.client
            .from('system_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1000);
          break;
        
        case 'audit':
          query = database.client
            .from('audit_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1000);
          break;
        
        case 'security':
          query = database.client
            .from('system_logs')
            .select('*')
            .in('level', ['error', 'warn', 'security'])
            .order('created_at', { ascending: false })
            .limit(1000);
          break;
        
        default:
          throw new Error('Type de logs non supporté');
      }

      const { data: logs, error } = await query;

      if (error) throw error;

      return logs || [];

    } catch (error) {
      logger.error('Erreur génération logs export', { type, error: error.message });
      return [];
    }
  }

  convertToCSV(logs) {
    if (!logs || logs.length === 0) {
      return 'Aucune donnée à exporter';
    }

    const headers = Object.keys(logs[0]).join(',');
    const rows = logs.map(log => 
      Object.values(log).map(value => 
        typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value
      ).join(',')
    );

    return [headers, ...rows].join('\n');
  }
}

module.exports = new LogController();