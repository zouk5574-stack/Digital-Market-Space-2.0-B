// Constantes de l'application
module.exports = {
  // Rôles utilisateur
  ROLES: {
    ADMIN: 1,
    BUYER: 2,
    SELLER: 3,

  },

  // Statuts des missions
  MISSION_STATUS: {
    DRAFT: 'draft',
    PUBLISHED: 'published',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled'
  },

  // Statuts des commandes
  ORDER_STATUS: {
    PENDING: 'pending',
    PAID: 'paid',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
    DISPUTED: 'disputed'
  },

  // Statuts des paiements
  PAYMENT_STATUS: {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    REFUNDED: 'refunded'
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
    WITHDRAWAL: 'withdrawal'
  },

  // Limites de l'application
  LIMITS: {
    MIN_MISSION_BUDGET: 1000,
    MAX_MISSION_BUDGET: 1000000,
    DAILY_WITHDRAWAL_LIMIT: 500000,
    MIN_WITHDRAWAL_AMOUNT: 1000,
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    MAX_PRODUCT_IMAGES: 5
  },

  // Configuration des uploads
  UPLOAD: {
    ALLOWED_MIME_TYPES: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'application/zip',
      'text/plain'
    ],
    PRODUCT_IMAGE_PATH: 'products/images',
    PRODUCT_FILE_PATH: 'products/files',
    MISSION_ATTACHMENT_PATH: 'missions/attachments'
  },

  // Intervalles Cron (en secondes)
  CRON_INTERVALS: {
    CLEANUP_FILES: 24 * 60 * 60, // 24 heures
    CHECK_ORDERS: 15 * 60, // 15 minutes
    CHECK_PAYMENTS: 10 * 60, // 10 minutes
    PROCESS_WITHDRAWALS: 24 * 60 * 60 // 24 heures
  }
};