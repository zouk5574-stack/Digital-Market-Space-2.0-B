import cron from 'node-cron';
import database from '../config/database.js';
import logger from '../utils/logger.js';
import constants from '../utils/constants.js';
import paymentService from '../services/paymentService.js';
import notificationService from '../services/notificationService.js';

class PaymentCron {
  constructor() {
    this.init();
  }

  init() {
    // Vérifier les paiements en attente toutes les 10 minutes
    cron.schedule(constants.CRON_SCHEDULES.CHECK_PAYMENTS, async () => {
      await this.checkPendingPayments();
      await this.checkFailedPayments();
    });

    logger.info('✅ Cron de vérification des paiements configuré');
  }

  async checkPendingPayments() {
    const jobId = `check_pending_payments_${Date.now()}`;
    
    try {
      logger.info(`💳 Vérification des paiements en attente: ${jobId}`);

      const { data: pendingPayments, error } = await database.client
        .from('payments')
        .select(`
          *,
          order:orders(
            *,
            mission:missions(title),
            buyer:users(first_name, last_name, email)
          )
        `)
        .eq('status', 'pending')
        .lt('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString()); // 30 minutes

      if (error) throw error;

      for (const payment of pendingPayments) {
        try {
          logger.debug(`Vérification paiement: ${payment.transaction_id}`, {
            paymentId: payment.id,
            orderId: payment.order_id
          });

          // Vérifier le statut avec FedaPay
          const verificationResult = await paymentService.verifyPayment(payment.transaction_id);
          
          if (!verificationResult.success) {
            logger.warn('Échec vérification paiement', {
              paymentId: payment.id,
              transactionId: payment.transaction_id,
              error: verificationResult.message
            });
            continue;
          }

          const updatedPayment = verificationResult.data;
          
          if (updatedPayment.status === 'completed') {
            logger.info('Paiement vérifié et complété', {
              paymentId: payment.id,
              orderId: payment.order_id,
              amount: payment.amount
            });

            // Notifier l'acheteur
            await notificationService.sendSystemNotification(
              payment.order.buyer_id,
              'Paiement Confirmé',
              `Votre paiement de ${payment.amount} FCFA pour la mission "${payment.order.mission?.title}" a été confirmé.`,
              {
                payment_id: payment.id,
                order_id: payment.order_id,
                amount: payment.amount,
                mission_title: payment.order.mission?.title
              }
            );

          } else if (updatedPayment.status === 'failed') {
            logger.warn('Paiement échoué détecté', {
              paymentId: payment.id,
              orderId: payment.order_id
            });

            // Notifier l'acheteur
            await notificationService.sendSystemNotification(
              payment.order.buyer_id,
              'Paiement Échoué',
              'Votre paiement a échoué. Veuillez réessayer ou utiliser une autre méthode de paiement.',
              {
                payment_id: payment.id,
                order_id: payment.order_id,
                amount: payment.amount
              }
            );
          }

        } catch (paymentError) {
          logger.error('Erreur traitement paiement individuel', {
            paymentId: payment.id,
            error: paymentError.message
          });
        }
      }

      logger.info(`✅ Vérification paiements en attente terminée: ${jobId}`, {
        processedCount: pendingPayments.length
      });

    } catch (error) {
      logger.error(`❌ Échec vérification paiements en attente: ${jobId}`, {
        error: error.message
      });
    }
  }

  async checkFailedPayments() {
    const jobId = `check_failed_payments_${Date.now()}`;
    
    try {
      logger.info(`🔍 Vérification des paiements échoués: ${jobId}`);

      const cleanupDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 jours

      const { data: failedPayments, error } = await database.client
        .from('payments')
        .select('id, transaction_id, created_at')
        .eq('status', 'failed')
        .lt('created_at', cleanupDate.toISOString());

      if (error) throw error;

      let cleanedCount = 0;

      for (const payment of failedPayments) {
        try {
          // Archiver les paiements échoués anciens
          await database.client
            .from('archived_payments')
            .insert({
              ...payment,
              archived_at: new Date().toISOString(),
              archive_reason: 'Nettoyage automatique - paiement échoué ancien'
            });

          // Supprimer de la table principale
          await database.client
            .from('payments')
            .delete()
            .eq('id', payment.id);

          cleanedCount++;

        } catch (archiveError) {
          logger.error('Erreur archivage paiement échoué', {
            paymentId: payment.id,
            error: archiveError.message
          });
        }
      }

      logger.info(`🧹 Nettoyage paiements échoués terminé: ${jobId}`, {
        cleanedCount,
        totalFailed: failedPayments.length
      });

    } catch (error) {
      logger.error(`❌ Échec nettoyage paiements échoués: ${jobId}`, {
        error: error.message
      });
    }
  }

  async generatePaymentReports() {
    const jobId = `payment_reports_${Date.now()}`;
    
    try {
      logger.info(`📊 Génération rapports paiements: ${jobId}`);

      // Rapport quotidien
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { data: todayPayments, error } = await database.client
        .from('payments')
        .select('amount, status, currency')
        .gte('created_at', today.toISOString())
        .eq('status', 'completed');

      if (error) throw error;

      const dailyStats = {
        date: today.toISOString().split('T')[0],
        total_amount: todayPayments.reduce((sum, p) => sum + p.amount, 0),
        transaction_count: todayPayments.length,
        currency: 'XOF'
      };

      // Sauvegarder le rapport
      await database.client
        .from('payment_reports')
        .insert({
          report_type: 'daily',
          report_date: today.toISOString(),
          report_data: dailyStats,
          generated_at: new Date().toISOString()
        });

      logger.info(`📈 Rapport paiements quotidien généré: ${jobId}`, dailyStats);

    } catch (error) {
      logger.error(`❌ Échec génération rapports paiements: ${jobId}`, {
        error: error.message
      });
    }
  }
}

// Export pour le démarrage
export function startPaymentCron() {
  return new PaymentCron();
}

export default PaymentCron;