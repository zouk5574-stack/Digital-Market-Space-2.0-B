// ... Imports et vérifications

const assignSellerToMission = async (req, res) => {
    // 1. Récupération des données (missionId, sellerId)
    // Assumons que mission_id est dans les params et seller_id dans le body
    const { missionId } = req.params;
    const { sellerId } = req.body; 

    // --- Récupérer les détails de la mission et le budget ---
    const { data: mission, error: missionError } = await supabase
        .from('freelance_missions')
        .select('buyer_id, budget, status')
        .eq('id', missionId)
        .single();
    
    if (missionError || !mission || mission.status !== 'open') {
        return res.status(404).json({ message: "Mission non trouvée ou non disponible." });
    }

    const buyer_id = mission.buyer_id;
    const mission_budget = mission.budget;

    // Démarrage d'une transaction de base de données pour l'atomicité de l'Escrow
    // NOTE: L'utilisation de RPC pour start/commit/rollback n'est pas standard. 
    // On assume que ces fonctions RPC PostgreSQL sont implémentées pour l'atomicité.
    await supabase.rpc('start_transaction'); 
    
    try {
        // --- 🔒 ÉTAPE 1 : Débit du portefeuille de l'Acheteur (ESCROW) ---
        // La fonction RPC doit vérifier si l'acheteur a les fonds
        const { data: walletUpdate, error: walletError } = await supabase.rpc('create_escrow_transaction', {
            p_user_id: buyer_id, 
            p_amount: mission_budget, // Montant du budget de la mission
            p_description: `Escrow for Mission: ${missionId}`
        });

        if (walletError || !walletUpdate || walletUpdate.status !== 'approved') {
            await supabase.rpc('rollback_transaction');
            // Gérer les erreurs de fonds insuffisants ou de transaction échouée
            // NOTE: Le message d'erreur est géré par la fonction RPC dans un cas réel
            return res.status(400).json({ message: "Échec du débit (fonds insuffisants ou erreur de transaction)." });
        }
        
        const escrowTransactionId = walletUpdate.transaction_id;

        // --- 🚀 ÉTAPE 2 : Attribution de la mission et mise à jour ---
        const { error: updateError } = await supabase
            .from('freelance_missions')
            .update({
                seller_id: sellerId,
                status: 'in_progress', // Passe la mission à "en cours"
                escrow_transaction_id: escrowTransactionId // L'ID de la transaction de séquestre
            })
            .eq('id', missionId);

        if (updateError) {
            // Si la mise à jour échoue, on annule tout (y compris l'escrow)
            await supabase.rpc('rollback_transaction');
            return res.status(500).json({ message: "Erreur lors de l'attribution de la mission." });
        }

        // Si tout est bon
        await supabase.rpc('commit_transaction');
        return res.status(200).json({ message: 'Vendeur attribué, fonds mis sous séquestre.' });

    } catch (e) {
        // En cas d'exception non gérée, on annule tout
        await supabase.rpc('rollback_transaction');
        console.error("Erreur Escrow/Attribution Mission:", e);
        return res.status(500).json({ message: 'Erreur interne du serveur lors de la transaction Escrow.' });
    }
}

// ... Export de la fonction
