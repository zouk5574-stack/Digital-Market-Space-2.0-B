// =========================================================
// src/server.js (VERSION FINALE BACKEND - CHEMIN CORRIGÉ & FEDAPAY INTÉGRÉ)
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
import { rawBodyMiddleware } from './src/middleware/rawBodyMiddleware.js'; // 🚨 NOUVEL IMPORT CRITIQUE
import authRoutes from './src/routes/authRoutes.js';
import fileRoutes from './src/routes/fileRoutes.js';
import productRoutes from './src/routes/productRoutes.js';
import freelanceRoutes from './src/routes/freelanceRoutes.js';
import logRoutes from './src/routes/logRoutes.js';
import orderRoutes from './src/routes/orderRoutes.js';
import fedapayRoutes from './src/routes/fedapayRoutes.js'; // 🚨 IMPORT DU ROUTEUR FEDAPAY

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

// 🚨 ATTENTION : express.json() ne doit PAS s'appliquer au Webhook FedaPay.
// Pour toutes les routes, sauf le Webhook, on parse le JSON normalement.
// Nous allons donc monter les middlewares de parsing après les routes FedaPay.

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

// === 🚨 MONTAGE CRITIQUE DU WEBHOOK FEDAPAY ===
// Le Webhook DOIT être placé AVANT les middlewares globaux express.json()/urlencoded()
// pour pouvoir utiliser le rawBodyMiddleware et vérifier la signature HMAC.
// On monte la route spécifique /webhook avec son middleware spécial.

// Nous faisons une dérogation en montant uniquement le webhook ici pour garantir la priorité 
// du rawBodyMiddleware, puis nous montons le reste de la route fedapay plus tard.
app.post('/api/fedapay/webhook', rawBodyMiddleware, fedapayRoutes);

// Middlewares globaux de parsing s'appliquant au reste des routes API
app.use(express.json()); 
app.use(express.urlencoded({ extended: true })); 

// === MONTAGE DES ROUTES STANDARD ===
app.use('/api/auth', authRoutes);

// La route /files utilise Multer
app.use('/api/files', upload.single('file'), fileRoutes); 

app.use('/api/products', productRoutes);
app.use('/api/freelance', freelanceRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/logs', logRoutes); 

// On monte le reste des routes fedapay (init-payment) ici, APRÈS le parsing JSON/URLENCODED
// Si vous utilisez la structure que j'ai proposée pour fedapayRoutes.js, 
// l'express.json() ici s'appliquera à la route /init-payment, ce qui est correct.
app.use('/api/fedapay', fedapayRoutes);


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
