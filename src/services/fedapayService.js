// src/services/fedapayService.js
import FedaPay from 'fedapay';

// ⚠️ ATTENTION : Suppression de l'initialisation statique ici (FedaPay.setApiKey...)
// La clé secrète et l'environnement seront passés DANS les méthodes.

const FRONTEND_URL = process.env.FRONTEND_URL;

const fedapayService = {
    /**
     * Crée une transaction sur FedaPay pour l'Escrow de Service.
     * @param {string} apiKey - Clé secrète FedaPay récupérée de la DB.
     * @param {string} env - Environnement ('sandbox' ou 'live').
     * @param {number} amount - Montant total à séquestrer (en XOF).
     * @param {string} description - Description de la transaction.
     * @param {string} missionId - ID de la mission.
     * @param {string} buyerId - ID de l'acheteur.
     * @returns {Promise<string>} L'URL de redirection FedaPay.
     */
    createEscrowServiceLink: async (apiKey, env, amount, description, missionId, buyerId) => {
        try {
            // Initialisation Dynamique du SDK pour la requête
            FedaPay.setApiKey(apiKey);
            FedaPay.setEnvironment(env); 
            
            const transaction = await FedaPay.Transaction.create({
                description: description,
                amount: amount,
                currency: { code: 'XOF' },
                metadata: {
                    type: 'ESCROW_SERVICE',
                    mission_id: missionId,
                    buyer_id: buyerId,
                },
                callback_url: `${FRONTEND_URL}/buyer/missions/${missionId}/status`, 
                cancel_url: `${FRONTEND_URL}/buyer/missions/${missionId}/cancel`, 
            });

            const token = await transaction.generateToken();
            return token.url; 

        } catch (error) {
            console.error("Erreur FedaPay (Service Escrow):", error.message);
            throw new Error(`FedaPay Error: ${error.message}`);
        }
    },

    /**
     * Crée une transaction sur FedaPay pour le paiement de Commande (Produits).
     * @param {string} apiKey - Clé secrète FedaPay récupérée de la DB.
     * @param {string} env - Environnement ('sandbox' ou 'live').
     * @param {number} amount - Montant total de la commande (en XOF).
     * @param {string} description - Description de la transaction.
     * @param {string} orderId - ID de la commande.
     * @param {string} buyerId - ID de l'acheteur.
     * @returns {Promise<string>} L'URL de redirection FedaPay.
     */
    createProductOrderLink: async (apiKey, env, amount, description, orderId, buyerId) => {
         try {
            // Initialisation Dynamique du SDK pour la requête
            FedaPay.setApiKey(apiKey);
            FedaPay.setEnvironment(env); 
             
            const transaction = await FedaPay.Transaction.create({
                description: description,
                amount: amount,
                currency: { code: 'XOF' },
                metadata: {
                    type: 'ORDER_PRODUCT',
                    order_id: orderId,
                    buyer_id: buyerId,
                },
                callback_url: `${FRONTEND_URL}/buyer/orders/${orderId}/status`, 
                cancel_url: `${FRONTEND_URL}/buyer/orders/${orderId}/cancel`, 
            });

            const token = await transaction.generateToken();
            return token.url; 

        } catch (error) {
            console.error("Erreur FedaPay (Paiement Commande):", error.message);
            throw new Error(`FedaPay Error: ${error.message}`);
        }
    }
};

export default fedapayService;
          
