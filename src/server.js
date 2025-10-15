// =========================================================
// src/server.js (VERSION FINALE CORRIGÉE - FEDAPAY INTÉGRÉ)
// =========================================================
import 'dotenv/config'; 
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';

// ------------------------------------
// 1. IMPORT DES MODULES CRITIQUES (Sécurité & Performance)
// ------------------------------------
import { startCleanupFilesCron } from './src/cron/cleanupFilesCron.js'; 
import { rawBodyMiddleware } from './src/middleware/rawBodyMiddleware.js';
import authRoutes from './src/routes/authRoutes.js';
import fileRoutes from './src/routes/fileRoutes.js';
import productRoutes from './src/routes/productRoutes.js';
import freelanceRoutes from './src/routes/freelanceRoutes.js';
import logRoutes from './src/routes/logRoutes.js';
import orderRoutes from './src/routes/orderRoutes.js';
import fedapayRoutes from './src/routes/fedapayRoutes.js';
import aiRoutes from './src/routes/aiRoutes.js'; // 🆕 IMPORT DES ROUTES IA

// ------------------------------------
// 2. INITIALISATION DE SUPABASE (Client partagé)
// ------------------------------------
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; 

if (!supabaseUrl || !supabaseKey) {
    console.error("CRITICAL ERROR: SUPABASE_URL or SUPABASE_SERVICE_KEY not set in .env");
    process.exit(1);
}

// 🚨 Exportez le client Supabase pour qu'il soit utilisé par tous les contrôleurs
export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }, 
});

// ------------------------------------
// 3. CONFIGURATION GÉNÉRALE DU SERVEUR
// ------------------------------------
const app = express();
const port = process.env.PORT || 3001;

// Middleware CORS global
app.use(cors({ 
    origin: process.env.CORS_ORIGIN || '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Configuration Multer pour les uploads de fichiers
export const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 🚨 Limite stricte de 10 MB
});

// ------------------------------------
// 4. MONTAGE STRATÉGIQUE DES ROUTES
// ------------------------------------

// Route de santé
app.get('/', (req, res) => {
    res.json({ 
        message: `Marketplace API is running on port ${port}`,
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

// === 🚨 ROUTE WEBHOOK FEDAPAY - CRITIQUE ===
// Doit être montée AVANT express.json() pour recevoir le corps brut
app.post('/api/fedapay/webhook', rawBodyMiddleware, fedapayRoutes);

// === MIDDLEWARES GLOBAUX - APRÈS LE WEBHOOK ===
app.use(express.json({ limit: '10mb' })); 
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// === MONTAGE DES ROUTES STANDARD ===
app.use('/api/auth', authRoutes);
app.use('/api/files', upload.single('file'), fileRoutes);
app.use('/api/products', productRoutes);
app.use('/api/freelance', freelanceRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/ai', aiRoutes); // 🆕 ROUTES DE L'ASSISTANT IA

// Routes FedaPay supplémentaires (hors webhook)
app.use('/api/fedapay', fedapayRoutes);

// ------------------------------------
// 5. GESTION DES ERREURS GLOBALES
// ------------------------------------

// Middleware de gestion des routes non trouvées
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Route not found',
        path: req.originalUrl,
        method: req.method
    });
});

// Middleware global de gestion des erreurs
app.use((error, req, res, next) => {
    console.error('Global Error Handler:', error);
    
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
                error: 'File too large',
                message: 'File size must be less than 10MB'
            });
        }
    }
    
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'production' 
            ? 'Something went wrong' 
            : error.message
    });
});

// ------------------------------------
// 6. DÉMARRAGE DU SERVEUR ET SERVICES
// ------------------------------------
app.listen(port, () => {
    console.log(`\n==============================================`);
    console.log(`🚀 Server running on port: ${port}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📊 Supabase connected: ${supabaseUrl ? '✅' : '❌'}`);
    
    // Démarrage du Cron de Nettoyage
    try {
        startCleanupFilesCron();
        console.log(`🔄 Cleanup cron: ✅ Started`);
    } catch (error) {
        console.log(`🔄 Cleanup cron: ❌ Failed - ${error.message}`);
    }
    
    console.log(`📋 Available routes:`);
    console.log(`   › GET  / (health check)`);
    console.log(`   › POST /api/fedapay/webhook (webhook)`);
    console.log(`   › POST /api/auth/*`);
    console.log(`   › POST /api/files/*`);
    console.log(`   › GET/POST /api/products/*`);
    console.log(`   › GET/POST /api/freelance/*`);
    console.log(`   › GET/POST /api/orders/*`);
    console.log(`   › GET /api/logs/* (admin)`);
    console.log(`   › POST/GET /api/ai/* (assistant IA)`);
    console.log(`   › POST/GET /api/fedapay/* (payments)`);
    console.log(`==============================================\n`);
});

// Gestion gracieuse de l'arrêt
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    process.exit(0);
});

export default app;
