const logger = require('./logger');
const constants = require('./constants');

// Helper pour les réponses API standardisées
const responseHelper = {
  success: (data = null, message = 'Opération réussie') => ({
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  }),

  error: (message = 'Erreur interne', details = null) => ({
    success: false,
    message,
    details,
    timestamp: new Date().toISOString()
  }),

  paginated: (data, pagination) => ({
    success: true,
    data: data.items || data,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total: pagination.total,
      pages: Math.ceil(pagination.total / pagination.limit)
    },
    timestamp: new Date().toISOString()
  })
};

// Helper pour la gestion des erreurs
const errorHelper = {
  handleServiceError: (error, serviceName) => {
    logger.error(`Erreur dans ${serviceName}:`, {
      message: error.message,
      stack: error.stack,
      code: error.code
    });

    // Erreurs de base de données
    if (error.code && error.code.startsWith('23')) {
      return new Error('Erreur de base de données');
    }

    // Erreurs de validation
    if (error.isJoi) {
      return new Error('Données invalides');
    }

    // Erreurs réseau
    if (error.code === 'NETWORK_ERROR' || error.code === 'ECONNREFUSED') {
      return new Error('Erreur de connexion');
    }

    return error;
  },

  isOperationalError: (error) => {
    return !(
      error instanceof TypeError ||
      error instanceof ReferenceError ||
      error instanceof RangeError
    );
  }
};

// Helper pour les opérations sur les fichiers
const fileHelper = {
  generateFilename: (originalname, prefix = 'file') => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const extension = originalname.split('.').pop();
    return `${prefix}_${timestamp}_${random}.${extension}`;
  },

  validateFileType: (mimetype, allowedTypes = constants.UPLOAD.ALLOWED_MIME_TYPES) => {
    return allowedTypes.includes(mimetype);
  },

  getFileExtension: (filename) => {
    return filename.split('.').pop().toLowerCase();
  },

  formatFileSize: (bytes) => {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
};

// Helper pour les opérations financières
const financialHelper = {
  formatAmount: (amount) => {
    return Math.round(amount); // Montants en entiers pour FedaPay
  },

  calculatePlatformFee: (amount, feePercentage = 0.10) => {
    return Math.round(amount * feePercentage);
  },

  calculateSellerAmount: (amount, feePercentage = 0.10) => {
    const fee = Math.round(amount * feePercentage);
    return amount - fee;
  },

  validateAmount: (amount, min = constants.LIMITS.MIN_MISSION_BUDGET, max = constants.LIMITS.MAX_MISSION_BUDGET) => {
    return amount >= min && amount <= max;
  }
};

// Helper pour les dates
const dateHelper = {
  formatForDisplay: (date) => {
    return new Date(date).toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  },

  addDays: (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  },

  isFuture: (date) => {
    return new Date(date) > new Date();
  },

  differenceInDays: (date1, date2) => {
    const diffTime = Math.abs(new Date(date2) - new Date(date1));
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
};

// Helper pour les chaînes de caractères
const stringHelper = {
  sanitize: (str) => {
    return str.trim().replace(/[<>]/g, '');
  },

  truncate: (str, length = 100) => {
    if (str.length <= length) return str;
    return str.substring(0, length) + '...';
  },

  generateRandomString: (length = 10) => {
    return Math.random().toString(36).substring(2, 2 + length);
  }
};

module.exports = {
  response: responseHelper,
  error: errorHelper,
  file: fileHelper,
  financial: financialHelper,
  date: dateHelper,
  string: stringHelper
};