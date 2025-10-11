// =========================================================
// server.js (VERSION FINALE BACKEND - CHEMIN CORRIGÉ)
// =========================================================
import 'dotenv/config'; 
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';

// ------------------------------------
// 1. IMPORT DES MODULES CRITIQUES (Sécurité & Performance)
// ------------------------------------
// 🚨 CORRECTION DU CHEMIN : S'assurer que le cron est bien dans src/cron
import { startCleanupFilesCron } from './src/cron/cleanupFilesCron.js'; 
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

// 🚨 Exportez le client Supabase pour qu'il soit utilisé par tous les contrôleurs
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
    limits: { fileSize: 10 * 1024 * 1024 } // 🚨 Limite stricte de 10 MB
});

// ------------------------------------
// 4. MONTAGE DES ROUTES API
// ------------------------------------
app.get('/', (req, res) => {
    res.send(`Marketplace API is running on port ${port}`);
});

app.use('/api/auth', authRoutes);
// Multer est intégré sur la route /files pour le traitement du fichier
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

    // Démarrage du Cron de Nettoyage
    startCleanupFilesCron(); 
    
    console.log(`==============================================\n`);
});

export default app;
