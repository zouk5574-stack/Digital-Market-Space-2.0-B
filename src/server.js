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

// ------------------------------------
// Résolution des chemins pour ES modules
// ------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ------------------------------------
// Import des routes (version ES modules)
// ------------------------------------
import routes from './routes/index.js'; // ✅ Point d'entrée unique

// Import des crons
import { startCleanupFilesCron } from './cron/cleanupFilesCron.js';
import { startOrderCron } from './cron/orderCron.js';
import { startPaymentCron } from './cron/paymentCron.js';
import { startWithdrawalCron } from './cron/withdrawalCron.js';

import { rawBodyMiddleware } from './middleware/rawBodyMiddleware.js';

// ------------------------------------
// Initialisation Supabase
// ------------------------------------
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ERREUR CRITIQUE: SUPABASE_URL ou SUPABASE_SERVICE_KEY manquant dans .env');
  process.exit(1);
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

// ------------------------------------
// Configuration du serveur
// ------------------------------------
const app = express();
const port = parseInt(process.PORT, 10) || 3001;
const isProd = process.env.NODE_ENV === 'production';

// Trust proxy
if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

// ------------------------------------
// Middlewares de sécurité et performances
// ------------------------------------
app.use(helmet());
app.use(compression());
app.use(morgan(process.env.LOG_FORMAT || (isProd ? 'combined' : 'dev')));

// Rate limiter global
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// ------------------------------------
// CORS Configuration
// ------------------------------------
const rawOrigins = process.env.CORS_ORIGIN || '*';
let corsOptions = { 
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], 
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'] 
};

if (rawOrigins !== '*') {
  const origins = rawOrigins.split(',').map(s => s.trim());
  corsOptions = {
    ...corsOptions,
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (origins.indexOf(origin) !== -1) return callback(null, true);
      return callback(new Error('CORS policy: origin not allowed'));
    },
    credentials: true,
  };
} else {
  corsOptions = { ...corsOptions, origin: '*' };
}
app.use(cors(corsOptions));

// ------------------------------------
// Multer configuration
// ------------------------------------
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ------------------------------------
// Configuration des routes
// ------------------------------------

// Health check
app.get('/', (req, res) => {
  res.json({
    message: `Marketplace API is running on port ${port}`,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  });
});

// IMPORTANT: Webhook FedaPay avec raw body
app.post('/api/fedapay/webhook', rawBodyMiddleware, (req, res) => {
  // Cette route sera gérée par le contrôleur FedaPay
  require('./controllers/fedapayController.js').handleWebhook(req, res);
});

// Body parsers (après webhook pour préserver rawBody)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ✅ TOUTES LES ROUTES VIA LE POINT D'ENTRÉE UNIQUE
app.use('/api', routes);

// ------------------------------------
// Routes 404
// ------------------------------------
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
  });
});

// ------------------------------------
// Global error handler
// ------------------------------------
app.use((error, req, res, next) => {
  try {
    console.error('❌ Global Error Handler:', error && error.stack ? error.stack : error);

    // Multer file size
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: 'File too large',
          message: 'File size must be less than 10MB',
        });
      }
    }

    // CORS error mapping
    if (error.message && error.message.includes('CORS policy')) {
      return res.status(403).json({ error: 'CORS Error', message: error.message });
    }

    const status = error.status || 500;
    const message = isProd ? 'Something went wrong' : (error.message || 'Internal server error');

    return res.status(status).json({
      error: status === 500 ? 'Internal server error' : error.name || 'Error',
      message,
      ...(isProd ? {} : { stack: error.stack }),
    });
  } catch (err) {
    console.error('❌ Error inside error handler:', err);
    return res.status(500).json({ error: 'Critical error', message: 'Fatal error in error handler' });
  }
});

// ------------------------------------
// Démarrage du serveur + crons
// ------------------------------------
const server = app.listen(port, async () => {
  console.log(`\n==============================================`);
  console.log(`🚀 Server running on port: ${port}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Supabase connected: ${supabaseUrl ? '✅' : '❌'}`);
  console.log(`📋 Available routes via /api/*`);
  console.log(`==============================================\n`);

  // Démarrage des crons
  try {
    startCleanupFilesCron();
    startOrderCron();
    startPaymentCron();
    startWithdrawalCron();
    console.log('🔄 All crons: ✅ Started');
  } catch (err) {
    console.error('🔄 Some crons failed to start:', err && err.message ? err.message : err);
  }
});

// ------------------------------------
// Arrêt gracieux
// ------------------------------------
const gracefulShutdown = async (signal) => {
  console.log(`${signal} received, shutting down gracefully`);
  try {
    if (server) {
      server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
      });

      setTimeout(() => {
        console.warn('Forcing shutdown after timeout');
        process.exit(1);
      }, 30000).unref();
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('Error during graceful shutdown', err);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
