// src/server.js (VERSION FINALE ET CORRIGÉE POUR LE LANCEMENT)

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit"; // ⬅️ IMPORT Sécurité
import { createClient } from "@supabase/supabase-js";
import { CronJob } from "cron"; // Pour la gestion des tâches cron
import multer from 'multer';

// -----------------------------------------------------
// 1. Initialisation de l'environnement et de Supabase
// -----------------------------------------------------

dotenv.config();

const port = process.env.PORT || 5000; // Utilisation de votre port par défaut
const BASE_URL = process.env.BASE_URL || `http://localhost:${port}`; 

// Initialisation de Supabase
// ⚠️ CRITIQUE : Utilisation de la clé SERVICE ROLE pour le Backend
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // ⬅️ CORRECTION : Utilisation de la clé SERVICE ROLE
);

const app = express();

// -----------------------------------------------------
// 2. Middlewares CRITIQUES & Sécurité
// -----------------------------------------------------

// ✅ Limiteur de requêtes (Sécurité)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Middleware CRITIQUE pour les Webhooks Fedapay (lecture du corps BRUT)
app.use((req, res, next) => {
    // Si l'URL est celle du webhook Fedapay
    if (req.originalUrl.includes('/api/fedapay/webhook')) {
        // Lit le corps en tant que texte/brut pour la vérification de la signature HMAC
        express.raw({ type: 'application/json', limit: '5mb' })(req, res, next);
    } else {
        // Pour toutes les autres routes, utilise le JSON standard
        express.json({ limit: '5mb' })(req, res, next);
    }
});

// Middleware multer pour la gestion des fichiers multipart
const upload = multer({ storage: multer.memoryStorage() }); 
app.use(upload.single('file')); 

// Autres middlewares standard
app.use(cors());
app.use(express.urlencoded({ extended: true }));


// -----------------------------------------------------
// 3. Importation des Routeurs
// -----------------------------------------------------

import authRouter from "./routes/authRoutes.js";
import productRouter from "./routes/productRoutes.js";
import orderRouter from "./routes/orderRoutes.js";
import walletRouter from "./routes/walletRoutes.js";
import freelanceRouter from "./routes/freelanceRoutes.js";
import withdrawalRouter from "./routes/withdrawalRoutes.js";
import fedapayRouter from "./routes/fedapayRoutes.js";
import paymentProviderRouter from "./routes/paymentProviderRoutes.js";
import notificationRouter from "./routes/notificationRoutes.js";
import logRouter from "./routes/logRoutes.js";
import fileRouter from "./routes/fileRoutes.js";
import adminRouter from "./routes/adminRoutes.js"; // Importé ici pour la suite

// -----------------------------------------------------
// 4. Déclaration des Routes
// -----------------------------------------------------

app.get("/", (req, res) => {
  res.send(`Marketplace API is running on port ${port} at ${new Date().toISOString()} 🚀`);
});

app.use("/api/auth", authRouter);
app.use("/api/products", productRouter);
app.use("/api/orders", orderRouter);
app.use("/api/wallet", walletRouter);
app.use("/api/freelance", freelanceRouter);
app.use("/api/withdrawals", withdrawalRouter);
app.use("/api/fedapay", fedapayRouter); // Webhook
app.use("/api/providers", paymentProviderRouter);
app.use("/api/files", fileRouter);
app.use("/api/logs", logRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/admin", adminRouter); // Ajout de la route ADMIN


// -----------------------------------------------------
// 5. Tâches de Fond (Cron Jobs)
// -----------------------------------------------------

// ⚡ CHEMINS CORRIGÉS : Remonte d'un niveau (../) pour atteindre le dossier 'cron' à la racine
import { startOrderCron } from "../cron/orderCron.js"; 
import { startPaymentCron } from "../cron/paymentCron.js";
import { startCleanupFilesCron } from "../cron/cleanupFilesCron.js"; 
import { startWithdrawalCron } from "../cron/withdrawalRoutes.js"; // ⬅️ Tâche Finale

// Tâche CRON 1 : Vérification et auto-validation horaire des commandes
startOrderCron(); 
console.log(`[CRON] Auto-validation des commandes planifiée : Every hour`);

// Tâche CRON 2 : Gestion de l'expiration des paiements
startPaymentCron();
console.log(`[CRON] Gestion des paiements expirés planifiée : Every 5 minutes`);

// Tâche CRON 3 : Nettoyage des fichiers
startCleanupFilesCron(); 
console.log(`[CRON] Nettoyage des fichiers planifié : Daily 3:30am`);

// Tâche CRON 4 : Auto-approbation des retraits
startWithdrawalCron(); 
console.log(`[CRON] Auto-approbation des retraits planifiée : Every hour`);


// -----------------------------------------------------
// 6. Démarrage du Serveur avec Vérification DB
// -----------------------------------------------------

// Fonction de vérification de l'état de la connexion DB
async function checkDbConnection() {
    try {
        const { count, error } = await supabase.from('users').select('*', { count: 'exact', head: true });
        
        if (error) {
            console.error("❌ Échec de la connexion/vérification Supabase:", error);
            throw new Error("Clé Service Role invalide ou base de données inaccessible.");
        }
        
        return true;
    } catch (err) {
        // Cette erreur est TRES PROBABLEMENT celle qui est renvoyée par Vercel
        console.error(`\n-----------------------------------------`);
        console.error(`🚨 ERREUR CRITIQUE DE DÉMARRAGE 🚨`);
        console.error(err.message);
        console.error(`Veuillez vérifier les variables d'environnement critiques.`);
        console.error(`-----------------------------------------\n`);
        return false;
    }
}

// Démarrage Conditionnel
async function startServer() {
    const isConnected = await checkDbConnection();
    
    if (isConnected) {
        app.listen(port, () => {
          console.log(`\n-----------------------------------------`);
          console.log(`✅ API Marketplace Lancée avec succès !`);
          console.log(`⚡ URL : ${BASE_URL}`);
          console.log(`Port : ${port}`);
          console.log(`-----------------------------------------`);
        });
    } else {
        // Arrête le processus pour éviter un état non fonctionnel
        process.exit(1); 
    }
}

startServer();
