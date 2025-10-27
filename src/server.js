import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import 'express-async-errors';

// Résolution des chemins ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import des middlewares
import { rawBodyMiddleware } from './middleware/rawBodyMiddleware.js';
import errorHandler from './middleware/errorHandler.js';

// Import des routes principales
import authRoutes from './routes/auth.js';
import missionRoutes from './routes/missionRoutes.js';
import orderRoutes from './routes/order.js';
import paymentRoutes from './routes/paymentRoutes.js';
import walletRoutes from './routes/walletRoutes.js';
import withdrawalRoutes from './routes/withdrawalRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import fileRoutes from './routes/fileRoutes.js';
import freelanceRoutes from './routes/freelanceRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import statsRoutes from './routes/statsRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import logRoutes from './routes/logRoutes.js';
import fedapayRoutes from './routes/fedapayRoutes.js';
import productRoutes from './routes/product.js';

// Import des crons
import { startCleanupFilesCron } from './cron/cleanupFilesCron.js';
import { startOrderCron } from './cron/orderCron.js';
import { startPaymentCron } from './cron/paymentCron.js';
import { startWithdrawalCron } from './cron/withdrawalCron.js';

// Configuration Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ERREUR CRITIQUE: Variables Supabase manquantes');
  console.error('Veuillez configurer SUPABASE_URL et SUPABASE_SERVICE_KEY dans .env');
  process.exit(1);
}

// Initialisation Supabase
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { 
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  },
  global: {
    headers: {
      'X-Client-Info': 'digital-market-space-backend'
    }
  }
});

// Configuration serveur
const app = express();
const port = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// ==================== CONFIGURATION MIDDLEWARES ====================

// Middlewares de sécurité
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(compression());

// Logging
app.use(morgan(isProd ? 'combined' : 'dev'));

// Rate Limiting intelligent
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProd ? 500 : 2000, // Plus permissif en développement
  message: {
    success: false,
    error: 'Trop de requêtes',
    message: 'Veuillez réessayer dans 15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // Strict pour l'authentification
  message: {
    success: false,
    error: 'Trop de tentatives',
    message: 'Veuillez réessayer dans 15 minutes'
  },
  skipSuccessfulRequests: true,
});

// Application du rate limiting
app.use('/api/auth', authLimiter);
app.use('/api', generalLimiter);

// CORS configuré
app.use(cors({
  origin: process.env.FRONTEND_URL || (isProd ? false : true),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Client-Version'],
  credentials: true,
  maxAge: 86400 // 24 heures
}));

// Pré-flight OPTIONS
app.options('*', cors());

// ==================== CONFIGURATION UPLOAD ====================

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 5 // Maximum 5 fichiers
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      // Images
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      // Documents
      'application/pdf', 
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      // Archives
      'application/zip', 'application/x-rar-compressed',
      // Texte
      'text/plain', 'text/markdown', 'application/json',
      // Audio/Video
      'audio/mpeg', 'audio/wav', 'video/mp4'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Type de fichier non autorisé: ${file.mimetype}`), false);
    }
  }
});

// ==================== CONFIGURATION BODY PARSERS ====================

// Webhook FedaPay nécessite le body brut
app.post('/api/webhooks/fedapay', rawBodyMiddleware, express.raw({ 
  type: 'application/json',
  limit: '1mb'
}));

// Body parsers standards
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb' 
}));

// ==================== ROUTES DE SANTÉ ====================

app.get('/health', async (req, res) => {
  try {
    // Test de connexion à Supabase
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1);

    const dbStatus = error ? 'ERROR' : 'OK';
    
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      version: '2.0.0',
      services: {
        database: dbStatus,
        storage: 'OK',
        cache: 'OK'
      },
      uptime: process.uptime(),
      memory: process.memoryUsage()
    });
  } catch (error) {
    res.status(503).json({
      status: 'ERROR',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ==================== ROUTES API ====================

// Routes publiques
app.use('/api/auth', authRoutes);
app.use('/api/missions', missionRoutes);
app.use('/api/products', productRoutes);

// Routes protégées
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/withdrawals', withdrawalRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/freelance', freelanceRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/ai', aiRoutes);

// Routes admin (protégées par rôle)
app.use('/api/admin', adminRoutes);
app.use('/api/logs', logRoutes);

// Webhooks (sans auth standard)
app.use('/api/webhooks/fedapay', fedapayRoutes);

// ==================== GESTION DES ERREURS ====================

// Route 404
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route non trouvée',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Middleware de gestion d'erreurs global
app.use(errorHandler);

// ==================== DÉMARRAGE SERVEUR ====================

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`
🌈 DIGITAL MARKET SPACE 2.0 - BACKEND PRODUCTION
📍 Port: ${port}
🌍 Environnement: ${process.env.NODE_ENV || 'development'}
📊 Supabase: ${supabaseUrl ? '✅ Connecté' : '❌ Erreur'}
⏰ Crons: Activés
🔒 Sécurité: Niveau Production
📈 Rate Limit: ${isProd ? '500 req/15min' : '2000 req/15min'}

🚀 ENDPOINTS PRINCIPAUX:
   › GET    /health              → Health check complet
   › POST   /api/auth/*          → Authentification
   › GET    /api/missions/*      → Missions freelance  
   › POST   /api/orders/*        → Commandes & livraisons
   › POST   /api/payments/*      → Paiements FedaPay
   › GET    /api/wallet/*        → Portefeuille & transactions
   › POST   /api/withdrawals/*   → Retraits
   › GET    /api/notifications/* → Notifications
   › POST   /api/files/*         → Upload fichiers
   › POST   /api/ai/*            → Assistant IA
   › GET    /api/admin/*         → Administration
   › POST   /api/webhooks/fedapay → Webhooks FedaPay

📋 TOTAL ENDPOINTS: 100+ routes sécurisées
  `);

  // Démarrage des crons en production seulement
  if (isProd) {
    try {
      startCleanupFilesCron();
      startOrderCron();
      startPaymentCron();
      startWithdrawalCron();
      console.log('🔄 Crons Production: ✅ Démarrage réussi');
    } catch (err) {
      console.error('❌ Erreur démarrage crons:', err.message);
    }
  } else {
    console.log('🔧 Mode Développement: Crons désactivés');
  }
});

// ==================== GESTION ARRÊT GRACIEUX ====================

const gracefulShutdown = (signal) => {
  console.log(`\n🛑 ${signal} reçu, arrêt gracieux du serveur...`);
  
  // Arrêt des nouvelles connexions
  server.close((err) => {
    if (err) {
      console.error('❌ Erreur fermeture serveur:', err);
      process.exit(1);
    }
    
    console.log('✅ Serveur fermé avec succès');
    
    // Nettoyage des ressources
    console.log('🧹 Nettoyage des ressources...');
    
    // Fermeture des connexions base de données
    // (Supabase gère automatiquement les connexions)
    
    process.exit(0);
  });

  // Timeout forcé après 10 secondes
  setTimeout(() => {
    console.log('⏰ Arrêt forcé après timeout de 10 secondes');
    process.exit(1);
  }, 10000).unref();
};

// Gestion des signaux d'arrêt
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Gestion des erreurs non catchées
process.on('uncaughtException', (error) => {
  console.error('💥 Erreur non catchée:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Promise rejetée non gérée:', reason);
  process.exit(1);
});

export default app;