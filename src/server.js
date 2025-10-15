// =========================================================
// src/server.js (VERSION CORRIGÉE - CHEMINS FIXÉS)
// =========================================================
import 'dotenv/config'; 
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

// ------------------------------------
// 1. RESOLUTION DES CHEMINS POUR ES MODULES
// ------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ------------------------------------
// 2. IMPORT DES MODULES (CHEMINS CORRIGÉS)
// ------------------------------------
// ❌ ANCIEN: import ... from './src/...'
// ✅ NOUVEAU: import ... from './...' (car nous sommes déjà dans src/)

import { startCleanupFilesCron } from './cron/cleanupFilesCron.js'; 
import { rawBodyMiddleware } from './middleware/rawBodyMiddleware.js';
import authRoutes from './routes/authRoutes.js';
import fileRoutes from './routes/fileRoutes.js';
import productRoutes from './routes/productRoutes.js';
import freelanceRoutes from './routes/freelanceRoutes.js';
import logRoutes from './routes/logRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import fedapayRoutes from './routes/fedapayRoutes.js';
import aiRoutes from './routes/aiRoutes.js'; // Routes IA

// ------------------------------------
// 3. INITIALISATION DE SUPABASE
// ------------------------------------
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; 

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ ERREUR CRITIQUE: SUPABASE_URL ou SUPABASE_SERVICE_KEY manquant dans .env");
    process.exit(1);
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }, 
});

// ------------------------------------
// 4. CONFIGURATION DU SERVEUR
// ------------------------------------
const app = express();
const port = process.env.PORT || 3001;

// Middleware CORS
app.use(cors({ 
    origin: process.env.CORS_ORIGIN || '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Configuration Multer
export const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
});

// ------------------------------------
// 5. MONTAGE STRATÉGIQUE DES ROUTES
// ------------------------------------

// Route de santé
app.get('/', (req, res) => {
    res.json({ 
        message: `Marketplace API is running on port ${port}`,
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

// === 🚨 WEBHOOK FEDAPAY - AVANT express.json() ===
app.post('/api/fedapay/webhook', rawBodyMiddleware, fedapayRoutes);

// === MIDDLEWARES GLOBAUX ===
app.use(express.json({ limit: '10mb' })); 
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// === ROUTES STANDARD ===
app.use('/api/auth', authRoutes);
app.use('/api/files', upload.single('file'), fileRoutes);
app.use('/api/products', productRoutes);
app.use('/api/freelance', freelanceRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/ai', aiRoutes);

// Routes FedaPay supplémentaires
app.use('/api/fedapay', fedapayRoutes);

// ------------------------------------
// 6. GESTION DES ERREURS
// ------------------------------------

// Route non trouvée
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Route not found',
        path: req.originalUrl,
        method: req.method
    });
});

// Gestionnaire d'erreurs global
app.use((error, req, res, next) => {
    console.error('❌ Global Error Handler:', error);
    
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
// 7. DÉMARRAGE DU SERVEUR
// ------------------------------------
app.listen(port, () => {
    console.log(`\n==============================================`);
    console.log(`🚀 Server running on port: ${port}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📊 Supabase connected: ${supabaseUrl ? '✅' : '❌'}`);
    
    // Démarrage du Cron
    try {
        startCleanupFilesCron();
        console.log(`🔄 Cleanup cron: ✅ Started`);
    } catch (error) {
        console.log(`🔄 Cleanup cron: ❌ Failed - ${error.message}`);
    }
    
    console.log(`📋 Available routes:`);
    console.log(`   › GET  / (health check)`);
    console.log(`   › POST /api/fedapay/webhook`);
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

// Arrêt gracieux
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    process.exit(0);
});

export default app;
