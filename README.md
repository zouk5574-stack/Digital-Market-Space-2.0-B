# Digital-Market-Space-2.0-B
Backend 


Digital Market Space 2.0 - Backend API 🛍️
Ce dépôt contient le code source de l'API backend pour Digital Market Space 2.0, une plateforme hybride qui combine une Marketplace de produits digitaux et des services de Freelance avec Escrow.

🌟 Concept Hybride
La plateforme est conçue autour de deux piliers transactionnels sécurisés :
 * E-commerce : Achat immédiat de produits digitaux.
 * Services (Escrow) : Financement de missions freelance où l'argent est mis en séquestre et débloqué au prestataire après la validation de la livraison par l'acheteur.

🛠️ Stack Technique
| Catégorie | Technologie | Rôle |
|---|---|---|
| Serveur | Node.js / Express.js | API RESTful. |
| Base de Données | Supabase (PostgreSQL) | Stockage des données, gestion des utilisateurs, transactions. |
| Paiement | FedaPay | Paiements sécurisés, gestion de l'Escrow et Webhooks. |
| Stockage | Supabase Storage | Hébergement des fichiers (produits, livrables). |
| IA | OpenAI | Assistant pour la création de contenu et l'aide utilisateur. |
| Automatisation | Crons (node-cron) | Tâches de maintenance, expiration et auto-validation. |


📦 Fonctionnalités Détaillées
1. Sécurité et Administration
 * Rôles : ACHETEUR, VENDEUR, ADMIN, SUPER_ADMIN.
 * Authentification : Utilisation de JWT et de middlewares de rôle stricts (requireRole).
 * Logs & Monitoring : Routes dédiées (/api/logs) pour le suivi des activités critiques.
 * Limitation de Taux (IA) : Protection spécifique de l'endpoint IA (/api/ai) contre les abus.
2. Finance et Transactions
 * Paiement Intégré : Utilise fedapayService pour initier les paiements et les transactions Escrow.
 * Webhooks Sécurisés : L'endpoint /api/fedapay/webhook est protégé par rawBodyMiddleware pour vérifier la signature HMAC, garantissant l'authenticité des notifications de paiement.
 * Distribution des Fonds : La logique comptable déduit la commission de la plateforme avant de créditer le portefeuille du vendeur/prestataire.
 * Retraits : Gestion complète des demandes de retrait et des historiques.
3. Cycle de Vie Freelance
 * Création de Mission : Par l'Acheteur.
 * Candidature : Par le Vendeur.
 * Initiation Escrow : Déclenchée par l'Acheteur lors de l'acceptation de la candidature, sécurisant le paiement.
 * Livraison et Validation : L'Acheteur valide le travail, ce qui envoie une commande au service FedaPay pour débloquer les fonds vers le Vendeur.
4. Automatisation (Crons)
 * Nettoyage : Purge des fichiers de stockage non réclamés après la période de rétention.
 * Expirations : Marquage des paiements en attente comme échoués après un délai de 30 minutes.
 * Auto-Validation : Validation automatique des retraits après 48 heures si aucun administrateur n'est intervenu (filet de sécurité).


🛠️ Installation et Lancement
Prérequis
 * Node.js (>=18.x)
 * Compte Supabase (pour DB/Storage)
 * Clés API FedaPay et OpenAI.
Étapes
 * Clonage :
   git clone [VOTRE_LIEN_GITHUB]
cd digital-market-space-2.0-backend

 * Dépendances :
   npm install

 * Configuration .env :
   Remplissez le fichier .env avec vos clés.
 * Démarrer le Serveur :
   npm run dev
# L'API démarrera sur le port 3001

Le serveur src/server.js gère l'initialisation de toutes les routes, les middlewares de sécurité globaux, et le démarrage des tâches Cron.

 
🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀
‎Digital-Market-Space-2.0-B/
‎├── src/
‎│   ├── controllers/
‎│   │   ├── adminController.js
‎│   │   ├── aiAssistantController.js
‎│   │   ├── authController.js
‎│   │   ├── fedapayController.js
‎│   │   ├── fileController.js
‎│   │   ├── freelanceController.js
‎│   │   ├── logController.js
‎│   │   ├── notificationController.js
‎│   │   ├── orderController.js
‎│   │   ├── paymentController.js
‎│   │   ├── paymentProviderController.js
‎│   │   ├── productController.js
‎│   │   ├── statsController.js
‎│   │   ├── walletController.js
‎│   │   └── withdrawalController.js
‎│   │
‎│   ├── cron/
‎│   │   ├── cleanupFilesCron.js
‎│   │   ├── orderCron.js
‎│   │   ├── paymentCron.js
‎│   │   └── withdrawalCron.js
‎│   │
‎│   ├── middleware/
‎│   │   ├── aiRateLimit.js
‎│   │   ├── authMiddleware.js
‎│   │   ├── rawBodyMiddleware.js
‎│   │   └── roleMiddleware.js
‎│   │
‎│   ├── routes/
‎│   │   ├── adminRoutes.js
‎│   │   ├── aiRoutes.js
‎│   │   ├── auth.js
‎│   │   ├── fedapayRoutes.js
‎│   │   ├── fileRoutes.js
‎│   │   ├── freelanceRoutes.js
‎│   │   ├── logRoutes.js
‎│   │   ├── notificationRoutes.js
‎│   │   ├── order.js
‎│   │   ├── paymentProviderRoutes.js
‎│   │   ├── paymentRoutes.js
‎│   │   ├── product.js
‎│   │   ├── statsRoutes.js
‎│   │   ├── walletRoutes.js
‎│   │   └── withdrawalRoutes.js
‎│   │
‎│   ├── services/
‎│   │   ├── contextService.js
‎│   │   ├── fedapayService.js
‎│   │   └── openAIService.js
‎│   │
‎│   ├── server.js
‎│   ├── .env
‎│   └── package.json
‎│
‎└── README.md
‎
‎
‎enregistre en mémoire 
‎Digital Market Space 🌌, votre satisfaction est notre priorité 


🤝 Licence
Ce projet est sous licence MIT.
