// =========================================================
// server.js (VERSION FINALE BACKEND - Chemin Cron Corrigé)
// =========================================================
import 'dotenv/config'; 
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';

// ------------------------------------
// 1. IMPORT DES MODULES CRITIQUES (Chemin corrigé pour le Cron)
// ------------------------------------
import { startCleanupFilesCron } from './src/cron/cleanupFilesCron.js'; // 🚨 CHEMIN CORRIGÉ
import authRoutes from './src/routes/authRoutes.js';
import fileRoutes from './src/routes/fileRoutes.js';
import productRoutes from './src/routes/productRoutes.js';
import freelanceRoutes from './src/routes/freelanceRoutes.js';
import logRoutes from './src/routes/logRoutes.js';
import orderRoutes from './src/routes/orderRoutes.js';

// ------------------------------------
// 2. INITIALISATION DE SUPABASE (Client partagé)
// ------------------------------------
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("CRITICAL ERROR: SUPABASE_URL or SUPABASE_SERVICE_KEY not set in .env");
    process.exit(1);
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
});

// ------------------------------------
// 3. CONFIGURATION GÉNÉRALE DU SERVEUR
// ------------------------------------
const app = express();
const port = process.env.PORT || 3001;

// Middlewares globaux
app.use(cors({ 
    origin: process.env.CORS_ORIGIN || '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

// Configuration Multer pour les uploads de fichiers
export const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // Limite à 10 MB pour la survie du plan gratuit
});

// ------------------------------------
// 4. MONTAGE DES ROUTES API
// ------------------------------------
app.get('/', (req, res) => {
    res.send(`Marketplace API is running on port ${port}`);
});

// Montage des routes (Les imports de routes sont supposés être dans src/routes)
app.use('/api/auth', authRoutes);
app.use('/api/files', upload.single('file'), fileRoutes);
app.use('/api/products', productRoutes);
app.use('/api/freelance', freelanceRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/logs', logRoutes); 

// ------------------------------------
// 5. DÉMARRAGE DU SERVEUR ET DU CRON
// ------------------------------------
app.listen(port, () => {
    console.log(`\n==============================================`);
    console.log(`🚀 Server listening at http://localhost:${port}`);
    
    // Démarrage du Cron
    startCleanupFilesCron(); 
    
    console.log(`==============================================\n`);
});

export default app;
