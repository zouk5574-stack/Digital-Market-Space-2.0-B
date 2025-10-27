import cron from 'node-cron';
import database from '../config/database.js';
import logger from '../utils/logger.js';
import constants from '../utils/constants.js';
import withdrawalService from '../services/withdrawalService.js';
import notificationService from '../services/notificationService.js';

class WithdrawalCron {
  constructor() {
    this.init();
  }

  init() {
    // Traiter les retraits tous les jours à 9h
    cron.schedule(constants.CRON_SCHEDULES.PROCESS_WITHDRAWALS, async () => {
      await this.processPendingWithdrawals();
      await this.cleanupOldWithdrawals();
    });

    logger.info('✅ Cron de traitement des retraits configuré');
  }

  async processPendingWithdrawals() {
    const jobId = `process_withdrawals_${Date.now()}`;
    
    try {
      logger.info(`💰 Traitement des retraits en attente: ${jobId}`);

      const { data: pendingWithdrawals, error } = await database.client
        .from('withdrawals')
        .select(`
          *,
          user:users(first_name, last_name, email, phone)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: true }) // Premier arrivé, premier servi
        .limit(50); // Limite pour éviter la surcharge

      if (error) throw error;

      let processedCount = 0;
      let failedCount = 0;

      for (const withdrawal of pendingWithdrawals) {
        try {
          logger.info(`Traitement retrait: ${withdrawal.id}`, {
            userId: withdrawal.user_id,
            amount: withdrawal.amount,
            paymentMethod: withdrawal.payment_method
          });

          // Simuler le traitement du retrait (remplacer par l'intégration réelle)
          const processingResult = await this.processWithdrawalPayment(withdrawal);
          
          if (processingResult.success) {
            // Mettre à jour le statut du retrait
            await database.client
              .from('withdrawals')
              .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                transaction_reference: processingResult.reference,
                updated_at: new Date().toISOString()
              })
              .eq('id', withdrawal.id);

            // Mettre à jour la transaction wallet
            await database.client
              .from('wallet_transactions')
              .update({
                status: 'completed',
                updated_at: new Date().toISOString()
              })
              .eq('withdrawal_id', withdrawal.id);

            // Notifier l'utilisateur
            await notificationService.sendSystemNotification(
              withdrawal.user_id,
              'Retrait Traité',
              `Votre retrait de ${withdrawal.amount} FCFA a été traité avec succès. Référence: ${processingResult.reference}`,
              {
                withdrawal_id: withdrawal.id,
                amount: withdrawal.amount,
                net_amount: withdrawal.net_amount,
                fee: withdrawal.fee,
                reference: processingResult.reference
              }
            );

            processedCount++;
            logger.info('Retrait traité avec succès', {
              withdrawalId: withdrawal.id,
              userId: withdrawal.user_id,
              amount: withdrawal.amount
            });

          } else {
            // Marquer comme échoué
            await database.client
              .from('withdrawals')
              .update({
                status: 'failed',
                failure_reason: processingResult.error,
                updated_at: new Date().toISOString()
              })
              .eq('id', withdrawal.id);

            // Remettre les fonds dans le portefeuille
            await database.client
              .from('users')
              .update({
                balance: database.client.raw(`balance + ${withdrawal.amount}`),
                updated_at: new Date().toISOString()
              })
              .eq('id', withdrawal.user_id);

            // Notifier l'utilisateur
            await notificationService.sendSystemNotification(
              withdrawal.user_id,
              'Retrait Échoué',
              `Votre retrait de ${withdrawal.amount} FCFA a échoué. Raison: ${processingResult.error}`,
              {
                withdrawal_id: withdrawal.id,
                amount: withdrawal.amount,
                error: processingResult.error
              }
            );

            failedCount++;
            logger.error('Retrait échoué', {
              withdrawalId: withdrawal.id,
              userId: withdrawal.user_id,
              error: processingResult.error
            });
          }

          // Pause pour éviter la surcharge
          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (withdrawalError) {
          failedCount++;
          logger.error('Erreur traitement retrait individuel', {
            withdrawalId: withdrawal.id,
            error: withdrawalError.message
          });
        }
      }

      logger.info(`✅ Traitement retraits terminé: ${jobId}`, {
        processedCount,
        failedCount,
        total: pendingWithdrawals.length
      });

    } catch (error) {
      logger.error(`❌ Échec traitement retraits: ${jobId}`, {
        error: error.message
      });
    }
  }

  async processWithdrawalPayment(withdrawal) {
    // Simulation du traitement de paiement
    // Remplacer par l'intégration réelle avec FedaPay ou autre processeur
    
    try {
      // 95% de succès en simulation
      const success = Math.random() > 0.05;

      if (success) {
        return {
          success: true,
          reference: `WDL_${Date.now()}_${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
          message: 'Retrait traité avec succès'
        };
      } else {
        return {
          success: false,
          error: 'Échec du traitement du retrait',
          message: 'Veuillez réessayer ou contacter le support'
        };
      }
    } catch (error) {
      logger.error('Erreur traitement paiement retrait', {
        withdrawalId: withdrawal.id,
        error: error.message
      });
      
      return {
        success: false,
        error: 'Erreur technique lors du traitement',
        message: 'Veuillez contacter le support'
      };
    }
  }

  async cleanupOldWithdrawals() {
    const jobId = `cleanup_withdrawals_${Date.now()}`;
    
    try {
      logger.info(`🧹 Nettoyage des anciens retraits: ${jobId}`);

      const archiveDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 jours

      const { data: oldWithdrawals, error } = await database.client
        .from('withdrawals')
        .select('*')
        .in('status', ['completed', 'failed', 'rejected'])
        .lt('created_at', archiveDate.toISOString())
        .limit(1000);

      if (error) throw error;

      let archivedCount = 0;

      for (const withdrawal of oldWithdrawals) {
        try {
          // Archiver le retrait
          await database.client
            .from('archived_withdrawals')
            .insert({
              ...withdrawal,
              archived_at: new Date().toISOString(),
              archive_reason: 'Nettoyage automatique - retrait ancien'
            });

          // Supprimer de la table principale
          await database.client
            .from('withdrawals')
            .delete()
            .eq('id', withdrawal.id);

          archivedCount++;

        } catch (archiveError) {
          logger.error('Erreur archivage retrait', {
            withdrawalId: withdrawal.id,
            error: archiveError.message
          });
        }
      }

      logger.info(`✅ Nettoyage retraits terminé: ${jobId}`, {
        archivedCount,
        totalOld: oldWithdrawals.length
      });

    } catch (error) {
      logger.error(`❌ Échec nettoyage retraits: ${jobId}`, {
        error: error.message
      });
    }
  }

  async generateWithdrawalReports() {
    const jobId = `withdrawal_reports_${Date.now()}`;
    
    try {
      logger.info(`📈 Génération rapports retraits: ${jobId}`);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { data: todayWithdrawals, error } = await database.client
        .from('withdrawals')
        .select('amount, net_amount, fee, status, payment_method')
        .gte('created_at', today.toISOString());

      if (error) throw error;

      const completedWithdrawals = todayWithdrawals.filter(w => w.status === 'completed');
      
      const dailyStats = {
        date: today.toISOString().split('T')[0],
        total_amount: completedWithdrawals.reduce((sum, w) => sum + w.amount, 0),
        net_amount: completedWithdrawals.reduce((sum, w) => sum + w.net_amount, 0),
        total_fees: completedWithdrawals.reduce((sum, w) => sum + w.fee, 0),
        withdrawal_count: completedWithdrawals.length,
        pending_count: todayWithdrawals.filter(w => w.status === 'pending').length,
        failed_count: todayWithdrawals.filter(w => w.status === 'failed').length
      };

      // Sauvegarder le rapport
      await database.client
        .from('withdrawal_reports')
        .insert({
          report_type: 'daily',
          report_date: today.toISOString(),
          report_data: dailyStats,
          generated_at: new Date().toISOString()
        });

      logger.info(`📊 Rapport retraits quotidien généré: ${jobId}`, dailyStats);

    } catch (error) {
      logger.error(`❌ Échec génération rapports retraits: ${jobId}`, {
        error: error.message
      });
    }
  }
}

// Export pour le démarrage
export function startWithdrawalCron() {
  return new WithdrawalCron();
}

export default WithdrawalCron;