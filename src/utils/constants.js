// Constantes de l'application - Version robuste
module.exports = {
  // Rôles utilisateur
  ROLES: {
    ADMIN: 1,
    BUYER: 2,
    SELLER: 3,
   
  },

  ROLE_NAMES: {
    1: 'admin',
    2: 'buyer',
    3: 'seller',
   
  },

  // Statuts des missions
  MISSION_STATUS: {
    DRAFT: 'draft',
    PUBLISHED: 'published',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
    EXPIRED: 'expired'
  },

  // Statuts des candidatures
  APPLICATION_STATUS: {
    PENDING: 'pending',
    ACCEPTED: 'accepted',
    REJECTED: 'rejected',
    WITHDRAWN: 'withdrawn'
  },

  // Statuts des commandes
  ORDER_STATUS: {
    PENDING: 'pending',
    PAID: 'paid',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
    DISPUTED: 'disputed',
    REFUNDED: 'refunded'
  },

  // Statuts des paiements
  PAYMENT_STATUS: {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    REFUNDED: 'refunded',
    CANCELLED: 'cancelled'
  },

  // Statuts des retraits
  WITHDRAWAL_STATUS: {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    REJECTED: 'rejected',
    FAILED: 'failed'
  },

  // Types de notification
  NOTIFICATION_TYPES: {
    SYSTEM: 'system',
    MISSION: 'mission',
    ORDER: 'order',
    PAYMENT: 'payment',
    WITHDRAWAL: 'withdrawal',
    APPLICATION: 'application'
  },

  // Catégories de produits/missions
  CATEGORIES: {
    WEB_DEVELOPMENT: 'web_development',
    MOBILE_DEVELOPMENT: 'mobile_development',
    GRAPHIC_DESIGN: 'graphic_design',
    WRITING: 'writing',
    MARKETING: 'marketing',
    VIDEO_EDITING: 'video_editing',
    MUSIC_AUDIO: 'music_audio',
    BUSINESS: 'business',
    LIFESTYLE: 'lifestyle',
    DATA_ANALYSIS: 'data_analysis'
  },

  // Limites de l'application
  LIMITS: {
    // Financières
    MIN_MISSION_BUDGET: 1000,
    MAX_MISSION_BUDGET: 1000000,
    MIN_PRODUCT_PRICE: 100,
    MAX_PRODUCT_PRICE: 500000,
    DAILY_WITHDRAWAL_LIMIT: 500000,
    MIN_WITHDRAWAL_AMOUNT: 1000,
    
    // Uploads
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    MAX_IMAGE_SIZE: 5 * 1024 * 1024, // 5MB
    MAX_PRODUCT_IMAGES: 5,
    MAX_MISSION_ATTACHMENTS: 10,
    
    // Contenu
    MAX_MISSION_TITLE: 255,
    MAX_MISSION_DESCRIPTION: 5000,
    MAX_PRODUCT_TITLE: 255,
    MAX_PRODUCT_DESCRIPTION: 5000,
    MAX_PROPOSAL_LENGTH: 2000,
    
    // Pagination
    DEFAULT_PAGE_LIMIT: 20,
    MAX_PAGE_LIMIT: 100
  },

  // Configuration des uploads
  UPLOAD: {
    ALLOWED_MIME_TYPES: {
      IMAGES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      DOCUMENTS: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      ARCHIVES: ['application/zip', 'application/x-rar-compressed'],
      TEXT: ['text/plain', 'text/markdown'],
      AUDIO: ['audio/mpeg', 'audio/wav', 'audio/ogg'],
      VIDEO: ['video/mp4', 'video/mpeg', 'video/ogg']
    },
    PATHS: {
      PRODUCT_IMAGES: 'products/images',
      PRODUCT_FILES: 'products/files',
      MISSION_ATTACHMENTS: 'missions/attachments',
      USER_AVATARS: 'users/avatars'
    }
  },

  // Intervalles Cron (en format cron)
  CRON_SCHEDULES: {
    CLEANUP_FILES: '0 2 * * *', // Tous les jours à 2h
    CHECK_ORDERS: '*/15 * * * *', // Toutes les 15 minutes
    CHECK_PAYMENTS: '*/10 * * * *', // Toutes les 10 minutes
    PROCESS_WITHDRAWALS: '0 9 * * *', // Tous les jours à 9h
    UPDATE_STATS: '0 0 * * *', // Tous les jours à minuit
    CLEANUP_LOGS: '0 1 * * 0' // Tous les dimanches à 1h
  },

  // Configuration FedaPay
  FEDAPAY: {
    CURRENCY: 'XOF',
    SUPPORTED_CURRENCIES: ['XOF'],
    TIMEOUT: 30000, // 30 secondes
    MAX_RETRIES: 3
  },

  // Frais de plateforme
  FEES: {
    PLATFORM_FEE_PERCENTAGE: 0.10, // 10%
    WITHDRAWAL_FEE_FIXED: 100, // 100 FCFA
    MIN_PLATFORM_FEE: 50 // 50 FCFA minimum
  },

  // Délais et expirations
  EXPIRATIONS: {
    MISSION_APPLICATION: 30 * 24 * 60 * 60 * 1000, // 30 jours
    ORDER_COMPLETION: 14 * 24 * 60 * 60 * 1000, // 14 jours
    PAYMENT_CONFIRMATION: 24 * 60 * 60 * 1000, // 24 heures
    EMAIL_VERIFICATION: 24 * 60 * 60 * 1000, // 24 heures
    PASSWORD_RESET: 1 * 60 * 60 * 1000 // 1 heure
  },

  // Configuration de sécurité
  SECURITY: {
    JWT_EXPIRES_IN: '7d',
    JWT_REFRESH_EXPIRES_IN: '30d',
    BCRYPT_ROUNDS: 12,
    RATE_LIMIT_WINDOW: 15 * 60 * 1000, // 15 minutes
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION: 30 * 60 * 1000 // 30 minutes
  }
};