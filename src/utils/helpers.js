const logger = require('./logger');
const constants = require('./constants');

// Helper pour les réponses API standardisées
class ResponseHelper {
  static success(data = null, message = 'Opération réussie', metadata = {}) {
    const response = {
      success: true,
      message,
      timestamp: new Date().toISOString(),
      ...metadata
    };

    if (data !== null) {
      response.data = data;
    }

    return response;
  }

  static paginated(data, pagination, message = 'Données récupérées avec succès') {
    return {
      success: true,
      message,
      data: data.items || data,
      pagination: {
        page: parseInt(pagination.page) || 1,
        limit: parseInt(pagination.limit) || constants.LIMITS.DEFAULT_PAGE_LIMIT,
        total: parseInt(pagination.total) || 0,
        pages: Math.ceil((parseInt(pagination.total) || 0) / (parseInt(pagination.limit) || constants.LIMITS.DEFAULT_PAGE_LIMIT))
      },
      timestamp: new Date().toISOString()
    };
  }

  static error(message = 'Une erreur est survenue', details = null, code = null) {
    const response = {
      success: false,
      message,
      timestamp: new Date().toISOString()
    };

    if (details) {
      response.details = details;
    }

    if (code) {
      response.code = code;
    }

    return response;
  }

  static validationError(details) {
    return this.error('Données de requête invalides', details, 'VALIDATION_ERROR');
  }

  static notFound(resource = 'Ressource') {
    return this.error(`${resource} non trouvé`, null, 'NOT_FOUND');
  }

  static unauthorized(message = 'Accès non autorisé') {
    return this.error(message, null, 'UNAUTHORIZED');
  }

  static forbidden(message = 'Accès refusé') {
    return this.error(message, null, 'FORBIDDEN');
  }
}

// Helper pour la gestion des erreurs
class ErrorHelper {
  static handleServiceError(error, serviceName, context = {}) {
    const errorInfo = {
      service: serviceName,
      message: error.message,
      stack: error.stack,
      ...context
    };

    // Classification des erreurs
    if (error.code) {
      errorInfo.code = error.code;
      
      // Erreurs de base de données Supabase
      if (error.code.startsWith('23')) {
        logger.error(`Erreur de base de données dans ${serviceName}`, errorInfo);
        return new Error('Erreur de traitement des données');
      }
      
      if (error.code === '23505') { // Violation de contrainte unique
        logger.warn(`Violation de contrainte unique dans ${serviceName}`, errorInfo);
        return new Error('Cette ressource existe déjà');
      }
      
      if (error.code === '23503') { // Violation de clé étrangère
        logger.warn(`Violation de clé étrangère dans ${serviceName}`, errorInfo);
        return new Error('Référence à une ressource inexistante');
      }
    }

    // Erreurs de validation Joi
    if (error.isJoi) {
      logger.warn(`Erreur de validation dans ${serviceName}`, errorInfo);
      return new Error('Données de requête invalides');
    }

    // Erreurs réseau
    if (error.code === 'NETWORK_ERROR' || error.code === 'ECONNREFUSED') {
      logger.error(`Erreur de connexion dans ${serviceName}`, errorInfo);
      return new Error('Erreur de connexion au service');
    }

    // Erreurs de timeout
    if (error.code === 'ETIMEDOUT') {
      logger.error(`Timeout dans ${serviceName}`, errorInfo);
      return new Error('Le service a mis trop de temps à répondre');
    }

    // Erreur générique
    logger.error(`Erreur inattendue dans ${serviceName}`, errorInfo);
    return error;
  }

  static isOperationalError(error) {
    return !(
      error instanceof TypeError ||
      error instanceof ReferenceError ||
      error instanceof RangeError ||
      error instanceof URIError
    );
  }

  static async withRetry(operation, maxRetries = 3, delay = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries) {
          logger.warn(`Tentative ${attempt} échouée, nouvelle tentative dans ${delay}ms`, {
            error: error.message,
            operation: operation.name
          });
          
          await new Promise(resolve => setTimeout(resolve, delay * attempt));
        }
      }
    }
    
    throw lastError;
  }
}

// Helper pour les opérations financières
class FinancialHelper {
  static formatAmount(amount) {
    return Math.round(Number(amount));
  }

  static calculatePlatformFee(amount, feePercentage = constants.FEES.PLATFORM_FEE_PERCENTAGE) {
    const fee = Math.round(amount * feePercentage);
    return Math.max(fee, constants.FEES.MIN_PLATFORM_FEE);
  }

  static calculateSellerAmount(amount, feePercentage = constants.FEES.PLATFORM_FEE_PERCENTAGE) {
    const fee = this.calculatePlatformFee(amount, feePercentage);
    return amount - fee;
  }

  static validateAmount(amount, min = constants.LIMITS.MIN_MISSION_BUDGET, max = constants.LIMITS.MAX_MISSION_BUDGET) {
    const numericAmount = Number(amount);
    return !isNaN(numericAmount) && numericAmount >= min && numericAmount <= max;
  }

  static formatCurrency(amount, currency = 'XOF') {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currency
    }).format(amount / 100);
  }

  static calculateWithdrawalFee(amount, fixedFee = constants.FEES.WITHDRAWAL_FEE_FIXED) {
    return fixedFee;
  }

  static calculateNetWithdrawalAmount(amount) {
    const fee = this.calculateWithdrawalFee(amount);
    return amount - fee;
  }
}

// Helper pour les dates
class DateHelper {
  static formatForDisplay(date, locale = 'fr-FR') {
    return new Date(date).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  static addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  static addHours(date, hours) {
    const result = new Date(date);
    result.setHours(result.getHours() + hours);
    return result;
  }

  static isFuture(date) {
    return new Date(date) > new Date();
  }

  static isPast(date) {
    return new Date(date) < new Date();
  }

  static differenceInDays(date1, date2) {
    const diffTime = Math.abs(new Date(date2) - new Date(date1));
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  static differenceInHours(date1, date2) {
    const diffTime = Math.abs(new Date(date2) - new Date(date1));
    return Math.ceil(diffTime / (1000 * 60 * 60));
  }

  static isExpired(date, expirationMs) {
    return new Date() > new Date(new Date(date).getTime() + expirationMs);
  }
}

// Helper pour les chaînes et textes
class StringHelper {
  static sanitize(input) {
    if (typeof input !== 'string') return input;
    
    return input
      .trim()
      .replace(/[<>]/g, '')
      .replace(/\s+/g, ' ')
      .substring(0, 1000); // Limite de sécurité
  }

  static truncate(text, length = 100, suffix = '...') {
    if (!text || text.length <= length) return text;
    
    return text.substring(0, length - suffix.length) + suffix;
  }

  static generateRandomString(length = 10) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return result;
  }

  static generateOrderReference(prefix = 'ORD') {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}_${timestamp}_${random}`;
  }

  static generateTransactionId() {
    return `tx_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }

  static capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  static slugify(text) {
    return text
      .toString()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '');
  }
}

// Helper pour les fichiers
class FileHelper {
  static generateFilename(originalname, prefix = 'file') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    const extension = originalname.split('.').pop();
    const sanitizedname = originalname
      .replace(`.${extension}`, '')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .substring(0, 50);
    
    return `${prefix}_${sanitizedname}_${timestamp}_${random}.${extension}`.toLowerCase();
  }

  static getFileExtension(filename) {
    return filename.split('.').pop().toLowerCase();
  }

  static validateFileType(mimetype, allowedTypes) {
    return allowedTypes.includes(mimetype);
  }

  static formatFileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  static getMimeCategory(mimetype) {
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('video/')) return 'video';
    if (mimetype.startsWith('audio/')) return 'audio';
    if (mimetype.startsWith('text/')) return 'text';
    if (mimetype.includes('pdf')) return 'document';
    if (mimetype.includes('zip') || mimetype.includes('rar')) return 'archive';
    return 'other';
  }
}

module.exports = {
  Response: ResponseHelper,
  Error: ErrorHelper,
  Financial: FinancialHelper,
  Date: DateHelper,
  String: StringHelper,
  File: FileHelper
};