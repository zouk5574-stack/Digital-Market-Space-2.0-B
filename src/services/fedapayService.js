// src/services/fedapayService.js
import FedaPay from 'fedapay'; // 🥂 Utilisation du SDK FedaPay
import { supabase } from "../server.js"; // Nécessaire pour les opérations DB (commissions, wallets)

// URL de base du Frontend pour les redirections
const FRONTEND_URL = process.env.FRONTEND_URL;

// Taux de commission de la plateforme
const PLATFORM_COMMISSION_RATE = 0.10; // 10%

// ===========================================
// 📦 Logique de Paiement (Création de Transaction)
// ===========================================

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
async function createMissionEscrowLink(apiKey, env, amount, description, missionId, buyerId) {
    try {
        // Initialisation Dynamique du SDK pour la requête
        FedaPay.setApiKey(apiKey);
        FedaPay.setEnvironment(env); 
        
        const transaction = await FedaPay.Transaction.create({
            description: description,
            amount: amount,
            currency: { code: 'XOF' },
            metadata: {
                type: 'ESCROW_SERVICE', // Type de flux
                mission_id: missionId,
                buyer_id: buyerId,
            },
            // URLs de redirection après paiement/annulation
            callback_url: `${FRONTEND_URL}/buyer/missions/${missionId}/status`, 
            cancel_url: `${FRONTEND_URL}/buyer/missions/${missionId}/cancel`, 
        });

        // Génération du lien de paiement FedaPay
        const token = await transaction.generateToken();
        return token.url; 

    } catch (error) {
        // Le SDK FedaPay peut renvoyer des erreurs détaillées
        const errMsg = error.message || (error.response && error.response.data);
        console.error("Erreur FedaPay (Service Escrow):", errMsg);
        throw new Error(`FedaPay Error: ${errMsg}`);
    }
}

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
async function createProductOrderLink(apiKey, env, amount, description, orderId, buyerId) {
     try {
        // Initialisation Dynamique du SDK pour la requête
        FedaPay.setApiKey(apiKey);
        FedaPay.setEnvironment(env); 
         
        const transaction = await FedaPay.Transaction.create({
            description: description,
            amount: amount,
            currency: { code: 'XOF' },
            metadata: {
                type: 'ORDER_PRODUCT', // Type de flux
                order_id: orderId,
                buyer_id: buyerId,
            },
            callback_url: `${FRONTEND_URL}/buyer/orders/${orderId}/status`, 
            cancel_url: `${FRONTEND_URL}/buyer/orders/${orderId}/cancel`, 
        });

        // Génération du lien de paiement FedaPay
        const token = await transaction.generateToken();
        return token.url; 

    } catch (error) {
        const errMsg = error.message || (error.response && error.response.data);
        console.error("Erreur FedaPay (Paiement Commande):", errMsg);
        throw new Error(`FedaPay Error: ${errMsg}`);
    }
}


// ===========================================
// 💰 Logique de Distribution des Fonds (Commande Produit)
// ===========================================

/**
 * Logique pour distribuer les fonds d'une commande réussie.
 * Débite l'escrow du système et crédite le portefeuille des vendeurs (net de commission).
 * @param {string} order_id - ID de la commande.
 * @param {string} internal_transaction_id - ID de la transaction interne (transactions.id) liée au paiement.
 * @returns {number} totalCommission - La commission totale générée.
 */
async function distributeOrderFunds(order_id, internal_transaction_id) {
    
    // 1. Récupérer les articles pour la répartition des fonds
    const { data: orderItems, error: itemsError } = await supabase
        .from('order_items')
        .select('seller_id, product_id, price, quantity')
        .eq('order_id', order_id);

    if (itemsError || !orderItems || orderItems.length === 0) {
        throw new Error(`Order items missing or DB error for order: ${order_id}`);
    }

    // 2. Calcul et répartition des fonds
    const creditPromises = [];
    let totalCommission = 0;

    for (const item of orderItems) {
        const saleAmount = item.price * item.quantity;
        const commissionAmount = saleAmount * PLATFORM_COMMISSION_RATE;
        const netAmount = saleAmount - commissionAmount;
        totalCommission += commissionAmount;

        // Création de la Commission (Table 'commissions')
        creditPromises.push(
            supabase.from("commissions").insert({
                order_id: order_id,
                seller_id: item.seller_id,
                amount: commissionAmount,
                rate: PLATFORM_COMMISSION_RATE,
                type: 'product' 
            })
        );
        
        // Crédit du Portefeuille (Table 'wallets' via RPC)
        creditPromises.push(
            supabase.rpc("increment_wallet_balance", {
                user_id_param: item.seller_id, 
                amount_param: netAmount,
                description_param: `Crédit vente produit ID ${item.product_id} commande #${order_id}`,
                order_id_param: order_id, 
                related_transaction_id_param: internal_transaction_id
            })
        );
    }
    
    // 3. Exécution atomique des crédits et commissions
    await Promise.all(creditPromises); 
    
    // 4. Mettre à jour le statut de la commande
    await supabase
        .from('orders')
        .update({ status: 'completed' }) 
        .eq('id', order_id);
    
    return totalCommission;
}


// ===========================================
// 💰 Logique de Distribution des Fonds (Déblocage Escrow)
// ===========================================

/**
 * Logique critique pour débloquer les fonds d'une mission Escrow.
 * @param {string} mission_id - ID de la mission.
 * @param {string} escrow_transaction_id - ID de la transaction interne (transactions.id) qui contenait l'Escrow.
 * @param {string} seller_id - ID du prestataire.
 * @param {number} final_price - Le prix final convenu (montant de la livraison validée).
 * @returns {number} commissionAmount - La commission prélevée.
 */
async function releaseEscrowFunds(mission_id, escrow_transaction_id, seller_id, final_price) {
    
    const commissionAmount = final_price * PLATFORM_COMMISSION_RATE;
    const netAmount = final_price - commissionAmount;

    // 1. Création de la Commission (Table 'commissions')
    const commissionPromise = supabase.from("commissions").insert({
        mission_id: mission_id,
        seller_id: seller_id,
        amount: commissionAmount,
        rate: PLATFORM_COMMISSION_RATE,
        type: 'mission' 
    });
    
    // 2. Crédit du Portefeuille (Table 'wallets' via RPC)
    // Débloque les fonds et crédite le prestataire du montant net.
    const creditPromise = supabase.rpc("increment_wallet_balance", {
        user_id_param: seller_id, 
        amount_param: netAmount,
        description_param: `Crédit mission freelance #${mission_id} (Net de commission)`,
        mission_id_param: mission_id, 
        related_transaction_id_param: escrow_transaction_id // Lien à la transaction Escrow
    });
    
    // 3. Exécution atomique
    await Promise.all([commissionPromise, creditPromise]); 
    
    return commissionAmount;
}

export default {
    createProductOrderLink,
    distributeOrderFunds,
    createMissionEscrowLink, // Renommé à partir de 'createEscrowServiceLink'
    releaseEscrowFunds,
};
    
