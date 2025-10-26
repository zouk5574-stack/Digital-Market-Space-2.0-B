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

// Résolution des chemins
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import des routes
import routes from './routes/index.js';

// Import des crons
import { startCleanupFilesCron } from './cron/cleanupFilesCron.js';
import { startOrderCron } from './cron/orderCron.js';
import { startPaymentCron } from './cron/paymentCron.js';
import { startWithdrawalCron } from './cron/withdrawalCron.js';

import { rawBodyMiddleware } from './middleware/rawBodyMiddleware.js';

// Initialisation Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ERREUR: Variables Supabase manquantes');
  process.exit(1);
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

// Configuration serveur
const app = express();
const port = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Middlewares sécurité
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());
app.use(morgan(isProd ? 'combined' : 'dev'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProd ? 100 : 1000, // Limite différente selon l'environnement
  message: 'Trop de requêtes, veuillez réessayer plus tard.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true
}));

// Configuration upload
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 5
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf', 'application/zip',
      'text/plain', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Type de fichier non autorisé'), false);
    }
  }
});

// Webhook FedaPay (raw body)
app.post('/api/fedapay/webhook', rawBodyMiddleware, (req, res) => {
  import('./controllers/fedapayController.js')
    .then(module => module.handleWebhook(req, res))
    .catch(error => {
      console.error('Webhook error:', error);
      res.status(500).json({ error: 'Erreur webhook' });
    });
});

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes API
app.use('/api', routes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Route 404
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route non trouvée',
    path: req.originalUrl,
    method: req.method,
  });
});

// Gestionnaire d'erreurs global
app.use((error, req, res, next) => {
  console.error('❌ Erreur globale:', error);

  // Erreur Multer
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'Fichier trop volumineux',
        message: 'La taille du fichier ne doit pas dépasser 10MB'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(413).json({
        error: 'Trop de fichiers',
        message: 'Maximum 5 fichiers autorisés'
      });
    }
  }

  // Erreur CORS
  if (error.message?.includes('CORS')) {
    return res.status(403).json({
      error: 'Erreur CORS',
      message: 'Origine non autorisée'
    });
  }

  const status = error.status || 500;
  const message = isProd && status === 500 
    ? 'Erreur interne du serveur' 
    : error.message || 'Erreur inattendue';

  res.status(status).json({
    error: status === 500 ? 'Internal Server Error' : error.name || 'Error',
    message,
    ...(!isProd && { stack: error.stack, details: error.details })
  });
});

// Démarrage serveur
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`
🚀 SERVEUR EN PRODUCTION
📍 Port: ${port}
🌍 Environnement: ${process.env.NODE_ENV || 'development'}
📊 Supabase: ${supabaseUrl ? '✅ Connecté' : '❌ Erreur'}
⏰ Crons: Activés
🔒 Sécurité: Renforcée
📈 Rate Limit: ${isProd ? '100 req/15min' : '1000 req/15min'}

📋 ENDPOINTS DISPONIBLES:
   › GET    /health              → Health check
   › POST   /api/fedapay/webhook → Webhook FedaPay
   › *      /api/*               → Toutes les routes API
  `);

  // Démarrage des crons
  try {
    startCleanupFilesCron();
    startOrderCron();
    startPaymentCron();
    startWithdrawalCron();
    console.log('🔄 Crons: ✅ Démarrage réussi');
  } catch (err) {
    console.error('❌ Erreur démarrage crons:', err.message);
  }
});

// Arrêt gracieux
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} reçu, arrêt gracieux...`);
  
  server.close(() => {
    console.log('✅ Serveur fermé');
    process.exit(0);
  });

  setTimeout(() => {
    console.log('❌ Arrêt forcé après timeout');
    process.exit(1);
  }, 10000).unref();
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
