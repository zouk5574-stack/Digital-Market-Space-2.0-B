// backend/controllers/missionController.js

// Importation de la connexion Supabase et des utilitaires si nécessaire
// NOTE: On assume que 'supabase' est un objet importé pour interagir avec la DB
import { supabase } from "../server.js"; 

/**
 * Attribue un vendeur à une mission freelance, débite le budget de l'acheteur (Escrow),
 * et passe la mission au statut 'in_progress'.
 */
export const assignSellerToMission = async (req, res) => {
    // 1. Récupération des données
    // missionId vient des paramètres d'URL (ex: /missions/:missionId/assign)
    const { missionId } = req.params;
    // sellerId vient du corps de la requête
    const { sellerId } = req.body; 

    // Vérification de la validité de l'ID de l'utilisateur qui fait la requête (doit être le buyer)
    // NOTE: On assume que req.user.db.id contient l'ID de l'utilisateur connecté (acheteur).
    const current_user_id = req.user.db.id; 

    // --- Récupérer les détails de la mission et le budget ---
    const { data: mission, error: missionError } = await supabase
        .from('freelance_missions')
        .select('buyer_id, budget, status')
        .eq('id', missionId)
        .single();
    
    if (missionError || !mission || mission.status !== 'open') {
        return res.status(404).json({ message: "Mission non trouvée ou non disponible (doit être 'open')." });
    }
    
    // Vérification de l'autorisation (seul l'acheteur peut attribuer la mission)
    if (mission.buyer_id !== current_user_id) {
        return res.status(403).json({ message: "Vous n'êtes pas autorisé à attribuer cette mission." });
    }

    const buyer_id = mission.buyer_id;
    const mission_budget = mission.budget;

    // Démarrage d'une transaction de base de données pour l'atomicité de l'Escrow
    // CRITIQUE: Cette partie est dépendante de l'implémentation des RPCs Supabase PostgreSQL.
    await supabase.rpc('start_transaction'); 
    
    try {
        // --- 🔒 ÉTAPE 1 : Débit du portefeuille de l'Acheteur (ESCROW) ---
        // Débit le portefeuille et crée un enregistrement 'escrow' dans la table 'transactions'
        const { data: walletUpdate, error: walletError } = await supabase.rpc('create_escrow_transaction', {
            p_user_id: buyer_id, 
            p_amount: mission_budget,
            p_description: `Escrow for Mission: ${missionId}`
        });

        if (walletError || !walletUpdate || walletUpdate.status !== 'approved') {
            await supabase.rpc('rollback_transaction');
            // Le message d'erreur sera probablement géré par la fonction RPC (ex: fonds insuffisants)
            return res.status(400).json({ message: "Échec du débit des fonds. Vérifiez votre solde." });
        }
        
        const escrowTransactionId = walletUpdate.transaction_id;

        // --- 🚀 ÉTAPE 2 : Attribution de la mission et mise à jour ---
        const { error: updateError } = await supabase
            .from('freelance_missions')
            .update({
                seller_id: sellerId,
                status: 'in_progress', 
                escrow_transaction_id: escrowTransactionId 
            })
            .eq('id', missionId);

        if (updateError) {
            // Si la mise à jour échoue, on annule le débit des fonds (rollback)
            await supabase.rpc('rollback_transaction');
            return res.status(500).json({ message: "Erreur lors de l'attribution de la mission ou de la sauvegarde." });
        }

        // Si tout est bon, on valide la transaction
        await supabase.rpc('commit_transaction');
        return res.status(200).json({ 
            message: 'Vendeur attribué. Les fonds ont été mis sous séquestre avec succès.', 
            escrowId: escrowTransactionId 
        });

    } catch (e) {
        // En cas d'exception non gérée, on annule tout
        await supabase.rpc('rollback_transaction');
        console.error("Erreur Escrow/Attribution Mission:", e);
        return res.status(500).json({ message: 'Erreur interne du serveur lors de la transaction Escrow.' });
    }
}
