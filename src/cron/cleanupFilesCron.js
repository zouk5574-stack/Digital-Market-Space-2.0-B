const cron = require('node-cron');
const fileService = require('../services/fileService');
const logger = require('../utils/logger');
const constants = require('../utils/constants');

class CleanupFilesCron {
  constructor() {
    this.init();
  }

  init() {
    // Exécuter tous les jours à 2h du matin
    cron.schedule(constants.CRON_SCHEDULES.CLEANUP_FILES, async () => {
      await this.cleanupOrphanedFiles();
    });

    logger.info('✅ Cron de nettoyage des fichiers configuré');
  }

  async cleanupOrphanedFiles() {
    const jobId = `cleanup_files_${Date.now()}`;
    
    try {
      logger.info(`🚀 Début du nettoyage des fichiers orphelins: ${jobId}`);

      const result = await fileService.cleanupOrphanedFiles();

      logger.info(`✅ Nettoyage fichiers orphelins terminé: ${jobId}`, {
        deletedCount: result.deletedCount,
        errorCount: result.errorCount,
        totalScanned: result.totalScanned
      });

    } catch (error) {
      logger.error(`❌ Échec nettoyage fichiers orphelins: ${jobId}`, {
        error: error.message,
        stack: error.stack
      });
    }
  }

  async cleanupTempFiles() {
    const jobId = `cleanup_temp_${Date.now()}`;
    
    try {
      logger.info(`🧹 Début nettoyage fichiers temporaires: ${jobId}`);

      // Supprimer les fichiers temporaires de plus de 24h
      const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const { data: tempFiles, error } = await database.client
        .from('files')
        .select('id, file_path, created_at')
        .eq('category', 'temp')
        .lt('created_at', cutoffDate.toISOString());

      if (error) throw error;

      let deletedCount = 0;
      let errorCount = 0;

      for (const file of tempFiles) {
        try {
          await fileService.deleteFile(file.id, 'system');
          deletedCount++;
        } catch (fileError) {
          errorCount++;
          logger.error('Erreur suppression fichier temporaire', {
            fileId: file.id,
            error: fileError.message
          });
        }
      }

      logger.info(`✅ Nettoyage fichiers temporaires terminé: ${jobId}`, {
        deletedCount,
        errorCount,
        totalScanned: tempFiles.length
      });

    } catch (error) {
      logger.error(`❌ Échec nettoyage fichiers temporaires: ${jobId}`, {
        error: error.message
      });
    }
  }
}

// Démarrer le cron
new CleanupFilesCron();

module.exports = CleanupFilesCron;