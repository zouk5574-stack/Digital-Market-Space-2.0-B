const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');
const constants = require('../utils/constants');

class DatabaseService {
  constructor() {
    this.validateEnvironment();
    this.client = this.initializeClient();
    this.initializeConnection();
  }

  validateEnvironment() {
    const requiredEnvVars = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_KEY',
      'SUPABASE_JWT_SECRET'
    ];

    const missing = requiredEnvVars.filter(key => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(`Variables d'environnement manquantes: ${missing.join(', ')}`);
    }

    logger.info('✅ Configuration environnement validée');
  }

  initializeClient() {
    const client = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false
        },
        db: {
          schema: 'public'
        },
        global: {
          headers: {
            'X-Client-Info': 'digital-market-space-backend',
            'X-API-Version': '2.0'
          }
        }
      }
    );

    logger.info('✅ Client Supabase initialisé');
    return client;
  }

  async initializeConnection() {
    try {
      // Test de connexion avec une requête simple
      const { data, error } = await this.client
        .from('users')
        .select('count')
        .limit(1);

      if (error) {
        throw new Error(`Erreur de connexion à Supabase: ${error.message}`);
      }

      logger.info('✅ Connexion à la base de données établie avec succès');
    } catch (error) {
      logger.error('❌ Erreur de connexion à la base de données:', error);
      throw error;
    }
  }

  // Méthodes pour les transactions sécurisées
  async executeTransaction(operations) {
    const transactionId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      logger.info(`Début de transaction: ${transactionId}`, { operationsCount: operations.length });

      // Exécuter les opérations en séquence avec gestion d'erreur
      const results = [];
      
      for (const operation of operations) {
        const { table, action, data, conditions } = operation;
        
        let result;
        switch (action) {
          case 'insert':
            result = await this.client
              .from(table)
              .insert(data)
              .select()
              .single();
            break;
            
          case 'update':
            let updateQuery = this.client
              .from(table)
              .update(data);
            
            if (conditions) {
              Object.keys(conditions).forEach(key => {
                updateQuery = updateQuery.eq(key, conditions[key]);
              });
            }
            
            result = await updateQuery.select().single();
            break;
            
          case 'delete':
            let deleteQuery = this.client
              .from(table)
              .delete();
            
            if (conditions) {
              Object.keys(conditions).forEach(key => {
                deleteQuery = deleteQuery.eq(key, conditions[key]);
              });
            }
            
            result = await deleteQuery.select().single();
            break;
            
          default:
            throw new Error(`Action non supportée: ${action}`);
        }

        if (result.error) {
          throw new Error(`Erreur ${action} sur ${table}: ${result.error.message}`);
        }

        results.push(result.data);
      }

      logger.info(`Transaction ${transactionId} réussie`, { resultsCount: results.length });
      return results;

    } catch (error) {
      logger.error(`Échec de la transaction ${transactionId}`, { error: error.message });
      throw error;
    }
  }

  // Méthodes CRUD sécurisées avec logging
  async safeInsert(table, data, options = {}) {
    const operationId = `insert_${table}_${Date.now()}`;
    
    try {
      logger.debug(`Début insertion: ${operationId}`, { table, data: this.sanitizeLogData(data) });

      const query = this.client
        .from(table)
        .insert(data);

      if (options.returning !== false) {
        query.select();
      }

      if (options.single) {
        query.single();
      }

      const { data: result, error } = await query;

      if (error) {
        throw this.handleDatabaseError(error, 'INSERT', table);
      }

      logger.debug(`Insertion réussie: ${operationId}`, { 
        table, 
        result: this.sanitizeLogData(result),
        rowsAffected: Array.isArray(result) ? result.length : 1
      });

      return result;

    } catch (error) {
      logger.error(`Échec insertion: ${operationId}`, { 
        table, 
        error: error.message,
        data: this.sanitizeLogData(data)
      });
      throw error;
    }
  }

  async safeUpdate(table, data, conditions, options = {}) {
    const operationId = `update_${table}_${Date.now()}`;
    
    try {
      logger.debug(`Début mise à jour: ${operationId}`, { 
        table, 
        conditions: this.sanitizeLogData(conditions),
        data: this.sanitizeLogData(data)
      });

      let query = this.client
        .from(table)
        .update(data);

      // Appliquer les conditions
      Object.keys(conditions).forEach(key => {
        query = query.eq(key, conditions[key]);
      });

      if (options.returning !== false) {
        query.select();
      }

      if (options.single) {
        query.single();
      }

      const { data: result, error } = await query;

      if (error) {
        throw this.handleDatabaseError(error, 'UPDATE', table);
      }

      logger.debug(`Mise à jour réussie: ${operationId}`, { 
        table, 
        conditions: this.sanitizeLogData(conditions),
        rowsAffected: Array.isArray(result) ? result.length : (result ? 1 : 0)
      });

      return result;

    } catch (error) {
      logger.error(`Échec mise à jour: ${operationId}`, { 
        table, 
        error: error.message,
        conditions: this.sanitizeLogData(conditions),
        data: this.sanitizeLogData(data)
      });
      throw error;
    }
  }

  async safeSelect(table, conditions = {}, options = {}) {
    const operationId = `select_${table}_${Date.now()}`;
    
    try {
      logger.debug(`Début sélection: ${operationId}`, { 
        table, 
        conditions: this.sanitizeLogData(conditions),
        options
      });

      let query = this.client
        .from(table)
        .select(options.fields || '*', options.count ? { count: 'exact' } : {});

      // Appliquer les conditions
      Object.keys(conditions).forEach(key => {
        if (Array.isArray(conditions[key])) {
          query = query.in(key, conditions[key]);
        } else {
          query = query.eq(key, conditions[key]);
        }
      });

      // Options de tri
      if (options.orderBy) {
        const orderOptions = Array.isArray(options.orderBy) ? options.orderBy : [options.orderBy];
        orderOptions.forEach(order => {
          const [column, direction] = order.split(':');
          query = query.order(column, { ascending: direction !== 'desc' });
        });
      }

      // Pagination
      if (options.limit) {
        query = query.limit(options.limit);
      }

      if (options.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
      }

      const { data, error, count } = await query;

      if (error) {
        throw this.handleDatabaseError(error, 'SELECT', table);
      }

      logger.debug(`Sélection réussie: ${operationId}`, { 
        table, 
        rowsReturned: Array.isArray(data) ? data.length : (data ? 1 : 0),
        totalCount: count
      });

      return options.count ? { data, count } : data;

    } catch (error) {
      logger.error(`Échec sélection: ${operationId}`, { 
        table, 
        error: error.message,
        conditions: this.sanitizeLogData(conditions)
      });
      throw error;
    }
  }

  async safeDelete(table, conditions, options = {}) {
    const operationId = `delete_${table}_${Date.now()}`;
    
    try {
      logger.debug(`Début suppression: ${operationId}`, { 
        table, 
        conditions: this.sanitizeLogData(conditions)
      });

      let query = this.client
        .from(table)
        .delete();

      // Appliquer les conditions
      Object.keys(conditions).forEach(key => {
        query = query.eq(key, conditions[key]);
      });

      if (options.returning !== false) {
        query.select();
      }

      if (options.single) {
        query.single();
      }

      const { data: result, error } = await query;

      if (error) {
        throw this.handleDatabaseError(error, 'DELETE', table);
      }

      logger.debug(`Suppression réussie: ${operationId}`, { 
        table, 
        conditions: this.sanitizeLogData(conditions),
        rowsDeleted: Array.isArray(result) ? result.length : (result ? 1 : 0)
      });

      return result;

    } catch (error) {
      logger.error(`Échec suppression: ${operationId}`, { 
        table, 
        error: error.message,
        conditions: this.sanitizeLogData(conditions)
      });
      throw error;
    }
  }

  // Gestion des erreurs de base de données
  handleDatabaseError(error, operation, table) {
    const errorContext = {
      operation,
      table,
      code: error.code,
      message: error.message,
      details: error.details
    };

    // Erreurs de contrainte
    if (error.code === '23505') {
      return new Error(`Une ressource similaire existe déjà dans ${table}`);
    }

    if (error.code === '23503') {
      return new Error(`Référence invalide dans ${table}`);
    }

    if (error.code === '23502') {
      return new Error(`Champ obligatoire manquant dans ${table}`);
    }

    // Erreurs de syntaxe/requête
    if (error.code.startsWith('42')) {
      return new Error(`Erreur de syntaxe dans la requête ${operation} sur ${table}`);
    }

    // Erreur générique
    return new Error(`Erreur ${operation} sur ${table}: ${error.message}`);
  }

  // Sanitisation des données pour les logs (sécurité)
  sanitizeLogData(data) {
    if (!data) return data;
    
    if (typeof data === 'object') {
      const sanitized = { ...data };
      
      // Masquer les champs sensibles
      const sensitiveFields = ['password', 'token', 'secret', 'key', 'authorization'];
      
      sensitiveFields.forEach(field => {
        if (sanitized[field]) {
          sanitized[field] = '***MASKED***';
        }
      });
      
      return sanitized;
    }
    
    return data;
  }

  // Méthodes utilitaires pour les relations
  async getUserWithProfile(userId) {
    try {
      const { data: authUser, error: authError } = await this.client.auth.admin.getUserById(userId);
      
      if (authError) throw authError;

      const { data: publicUser, error: publicError } = await this.safeSelect('users', { id: userId }, { single: true });

      if (publicError) throw publicError;

      return {
        ...authUser.user,
        ...publicUser,
        role_name: constants.ROLE_NAMES[publicUser.role_id] || 'unknown'
      };

    } catch (error) {
      logger.error('Erreur récupération utilisateur avec profil:', error);
      throw error;
    }
  }

  async updateUserLastActive(userId) {
    try {
      await this.safeUpdate('users', { 
        last_active: new Date().toISOString() 
      }, { id: userId });
    } catch (error) {
      // Ne pas throw pour ne pas bloquer les requêtes principales
      logger.warn('Échec mise à jour last_active', { userId, error: error.message });
    }
  }
}

// Instance singleton
const databaseService = new DatabaseService();

module.exports = databaseService;