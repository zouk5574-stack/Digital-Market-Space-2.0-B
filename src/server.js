// src/server.js
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
import 'express-async-errors'; // pour propager correctement les erreurs async

// ------------------------------------
// Résolution des chemins pour ES modules
// ------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ------------------------------------
// Import des modules applicatifs (routes, crons, middlewares)
// ------------------------------------
import { startCleanupFilesCron } from './cron/cleanupFilesCron.js';
import { startOrderCron } from './cron/orderCron.js';
import { startPaymentCron } from './cron/paymentCron.js';
import { startWithdrawalCron } from './cron/withdrawalCron.js';



import authRoutes from './routes/auth.js';
import adminRoutes from './routes/adminRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import fedapayRoutes from './routes/fedapayRoutes.js';
import fileRoutes from './routes/fileRoutes.js';
import freelanceRoutes from './routes/freelanceRoutes.js';
import logRoutes from './routes/logRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import orderRoutes from './routes/order.js';
import paymentRoutes from './routes/paymentRoutes.js';
import paymentProviderRoutes from './routes/paymentProviderRoutes.js';
import productRoutes from './routes/product.js';
import statsRoutes from './routes/statsRoutes.js';
import walletRoutes from './routes/walletRoutes.js';
import withdrawalRoutes from './routes/withdrawalRoutes.js';

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
const port = parseInt(process.env.PORT, 10) || 3001;
const isProd = process.env.NODE_ENV === 'production';

// -- Trust proxy (utile si tu utilises un reverse proxy / heroku / vercel)
// configure selon ton infra
if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

// ------------------------------------
// Middlewares de sécurité et performances
// ------------------------------------
app.use(helmet()); // headers de sécurité
app.use(compression()); // gzip
app.use(morgan(process.env.LOG_FORMAT || (isProd ? 'combined' : 'dev')));

// Rate limiter global (tu peux affiner par route)
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // max 120 requêtes par IP / minute
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// ------------------------------------
// CORS - lecture de CORS_ORIGIN (peut être une liste comma-separated)
// ------------------------------------
const rawOrigins = process.env.CORS_ORIGIN || '*';
let corsOptions = { methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'] };

if (rawOrigins !== '*') {
  const origins = rawOrigins.split(',').map(s => s.trim());
  corsOptions = {
    ...corsOptions,
    origin: function (origin, callback) {
      // Allow non-browser requests (curl, server-to-server) with no origin
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
// Multer configuration (upload memory storage, limite 10MB)
// ------------------------------------
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ------------------------------------
// ROUTES - health check + webhook (raw body) + middlewares json/urlencoded
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

// IMPORTANT: webhook qui nécessite raw body (ex: signature validation)
app.post('/api/fedapay/webhook', rawBodyMiddleware, fedapayRoutes);

// Body parsers (après webhook middleware pour laisser rawBody intact)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes applicatives
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/files', upload.single('file'), fileRoutes);
app.use('/api/freelance', freelanceRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/payment-providers', paymentProviderRoutes);
app.use('/api/products', productRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/withdrawals', withdrawalRoutes);

// Routes FedaPay supplémentaires (API / console actions)
app.use('/api/fedapay', fedapayRoutes);

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
  console.log(`📋 Available routes:`);
  console.log(`   › GET  / (health check)`);
  console.log(`   › POST /api/fedapay/webhook`);
  console.log(`   › POST /api/auth/*`);
  console.log(`   › GET/POST /api/admin/*`);
  console.log(`   › POST /api/files/*`);
  console.log(`   › GET/POST /api/products/*`);
  console.log(`   › GET/POST /api/freelance/*`);
  console.log(`   › GET/POST /api/orders/*`);
  console.log(`   › GET /api/logs/* (admin)`);
  console.log(`   › POST/GET /api/ai/* (assistant IA)`);
  console.log(`   › POST/GET /api/fedapay/* (payments)`);
  console.log(`   › GET/POST /api/notifications/*`);
  console.log(`   › GET/POST /api/payments/*`);
  console.log(`   › GET/POST /api/payment-providers/*`);
  console.log(`   › GET /api/stats/*`);
  console.log(`   › GET/POST /api/wallet/*`);
  console.log(`   › GET/POST /api/withdrawals/*`);
  console.log(`==============================================\n`);

  // Démarrage des crons (si erreur -> log mais ne crash pas le server)
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
// Arrêt gracieux (SIGINT / SIGTERM)
// ------------------------------------
const gracefulShutdown = async (signal) => {
  console.log(`${signal} received, shutting down gracefully`);
  try {
    // Si tes crons exportent des fonctions stop(), appelle-les ici (ex: stopCleanupFilesCron())
    // try { await stopCleanupFilesCron(); } catch(e){ console.warn('stop cleanup cron failed', e); }

    // fermer le server express
    if (server) {
      server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
      });

      // en cas de timeout forcer l'arrêt
      setTimeout(() => {
        console.warn('Forcing shutdown after timeout');
        process.exit(1);
      }, 30_000).unref();
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