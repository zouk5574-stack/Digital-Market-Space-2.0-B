// =========================================================
// server.js (VERSION FINALE BACKEND)
// =========================================================
import 'dotenv/config'; // 🚨 IMPORTANT : Charger les variables d'environnement au démarrage
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer'; // Pour la gestion des fichiers dans fileController.js

// ------------------------------------
// 1. IMPORT DES MODULES CRITIQUES (Sécurité & Performance)
// ------------------------------------
import { startCleanupFilesCron } from './cron/cleanupFilesCron.js'; // 🚨 Cron de Nettoyage (Survie Plan Gratuit)
import authRoutes from './src/routes/authRoutes.js';        // Routes d'Inscription/Connexion
import fileRoutes from './src/routes/fileRoutes.js';        // Routes de gestion de fichiers (Upload/Téléchargement)
import productRoutes from './src/routes/productRoutes.js';    // Routes des produits digitaux
import freelanceRoutes from './src/routes/freelanceRoutes.js'; // Routes des missions freelance
import logRoutes from './src/routes/logRoutes.js';          // Routes d'audit des logs (Admin)
import orderRoutes from './src/routes/orderRoutes.js';        // Routes des commandes

// ------------------------------------
// 2. INITIALISATION DE SUPABASE (Client partagé)
// ------------------------------------
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Utiliser la clé Service Role pour le backend (meilleure sécurité et moins de RLS)

if (!supabaseUrl || !supabaseKey) {
    console.error("CRITICAL ERROR: SUPABASE_URL or SUPABASE_SERVICE_KEY not set in .env");
    process.exit(1);
}

// 🚨 Exportez le client Supabase pour qu'il soit utilisé par tous les contrôleurs
export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }, // Les sessions Supabase Auth sont gérées par notre propre JWT
});

// ------------------------------------
// 3. CONFIGURATION GÉNÉRALE DU SERVEUR
// ------------------------------------
const app = express();
const port = process.env.PORT || 3001;

// Middlewares globaux
app.use(cors({ 
    origin: process.env.CORS_ORIGIN || '*', // Réglez ceci sur votre domaine Next.js en production
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));
app.use(express.json()); // Pour gérer le corps des requêtes JSON
app.use(express.urlencoded({ extended: true })); // Pour gérer le corps des requêtes url-encoded

// Configuration Multer pour les uploads de fichiers
// Nous utilisons `memoryStorage` car nous traitons/optimisons le fichier dans le contrôleur (sharp)
export const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 🚨 Limite du fichier définie à 10 MB ici aussi (pour le multipart)
});

// ------------------------------------
// 4. MONTAGE DES ROUTES API
// ------------------------------------
app.get('/', (req, res) => {
    res.send(`Marketplace API is running on port ${port}`);
});

// Routes principales
app.use('/api/auth', authRoutes);
app.use('/api/files', upload.single('file'), fileRoutes); // Utilise Multer comme middleware sur la route /files
app.use('/api/products', productRoutes);
app.use('/api/freelance', freelanceRoutes);
app.use('/api/orders', orderRoutes);

// Route Admin (Audit/Surveillance)
app.use('/api/logs', logRoutes); 

// ------------------------------------
// 5. DÉMARRAGE DU SERVEUR ET DU CRON
// ------------------------------------
app.listen(port, () => {
    console.log(`\n==============================================`);
    console.log(`🚀 Server listening at http://localhost:${port}`);
    
    // 🚨 Démarrage du Cron de Nettoyage (essentiel pour la survie du plan gratuit)
    startCleanupFilesCron(); 
    
    console.log(`==============================================\n`);
});

// Exportation pour les tests unitaires (optionnel)
export default app;
