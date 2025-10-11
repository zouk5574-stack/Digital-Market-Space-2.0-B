// =========================================================
// cron/cleanupFilesCron.js (VERSION FINALE ET OPTIMISÉE)
// =========================================================
import { CronJob } from 'cron';
import { supabase } from '../src/server.js'; 
import dayjs from 'dayjs'; 

// Récupération des variables d'environnement
// 🚨 Rétention agressive (par défaut 15 jours pour survie plan gratuit)
const FILE_RETENTION_DAYS = Number(process.env.FILE_RETENTION_DAYS || 15); 
const BUCKET = process.env.SUPABASE_FILES_BUCKET || "product-files";

const cleanupFiles = async () => {
    console.log(`[CLEANUP CRON] Démarrage du nettoyage. Rétention: ${FILE_RETENTION_DAYS} jours.`);

    try {
        // 1. Calculer la date limite (aujourd'hui moins la période de rétention)
        const dateLimit = dayjs().subtract(FILE_RETENTION_DAYS, 'day').toISOString();
        
        // 2. Sélectionner les chemins de stockage à supprimer
        // Nous utilisons .lt ('less than') pour cibler les fichiers créés AVANT la date limite.
        const { data: filesToDelete, error: selectError } = await supabase
            .from('product_files')
            .select('id, storage_path')
            .lt('created_at', dateLimit); 
            // ⚠️ Pas besoin de limite ici si nous traitons la suppression par lot ci-dessous

        if (selectError) throw selectError;

        if (!filesToDelete || filesToDelete.length === 0) {
            console.log("[CLEANUP CRON] Aucuns fichiers à purger trouvés.");
            return;
        }

        const storagePaths = filesToDelete.map(f => f.storage_path);
        const fileIds = filesToDelete.map(f => f.id);

        console.log(`[CLEANUP CRON] Tentative de suppression de ${fileIds.length} fichiers (Storage + Metadata).`);

        // 3. Supprimer les fichiers de Supabase Storage (Par LOT)
        // La méthode .remove() gère la suppression par lots jusqu'à 1000 chemins
        const { error: storageError } = await supabase.storage
            .from(BUCKET)
            .remove(storagePaths);

        if (storageError) {
            console.error("[CLEANUP CRON] Erreur lors de la suppression du stockage, continuant la suppression des métadonnées:", storageError);
            // On continue pour supprimer la métadonnée même si le fichier est manquant dans le stockage
        }

        // 4. Supprimer les métadonnées de la table 'product_files' (Par LOT)
        const { error: deleteMetaError } = await supabase
            .from('product_files')
            .delete()
            .in('id', fileIds);

        if (deleteMetaError) {
            console.error("[CLEANUP CRON] Erreur lors de la suppression des métadonnées:", deleteMetaError);
            throw deleteMetaError;
        }

        console.log(`[CLEANUP CRON] ✅ ${fileIds.length} fichiers purgés avec succès.`);

    } catch (err) {
        console.error("[CLEANUP CRON] Erreur FATALE lors du processus de nettoyage:", err.message);
    }
};

// Exécution tous les jours à 3h30 du matin (heure du serveur, Europe/Paris)
const cleanupJob = new CronJob('30 3 * * *', cleanupFiles, null, true, 'Europe/Paris');

export const startCleanupFilesCron = () => {
    cleanupJob.start();
    console.log("[CRON] Nettoyage des fichiers planifié : Daily 3:30am (Europe/Paris).");
};
