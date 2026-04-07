const cron = require('node-cron');
const pool = require('../config/database');
const crypto = require('crypto');

const initializeDeletionJob = () => {
    // Run daily at midnight
    cron.schedule('0 0 * * *', async () => {
        console.log('[GDPR Cron] Starting daily deletion and anonymization sweep...');
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            // Find all pending_deletion accounts where the 30-day window has expired
            const [expiredUsers] = await connection.execute(
                "SELECT id FROM users WHERE status = 'pending_deletion' AND deletion_scheduled_at <= CURRENT_TIMESTAMP"
            );

            if (expiredUsers.length === 0) {
                console.log('[GDPR Cron] No expired accounts to process today.');
                await connection.rollback();
                connection.release();
                return;
            }

            console.log(`[GDPR Cron] Found ${expiredUsers.length} accounts to anonymize/delete.`);

            for (let user of expiredUsers) {
                const userId = user.id;

                // 1. Delete Messages authored by user (Hard delete)
                await connection.execute('DELETE FROM messages WHERE sender_id = ?', [userId]);
                await connection.execute('DELETE FROM conversation_participants WHERE user_id = ?', [userId]);

                // 2. Delete Connections (Hard delete)
                await connection.execute('DELETE FROM connections WHERE user_id = ? OR connected_user_id = ?', [userId, userId]);

                // 3. Delete Verifications & Activity Logs (Hard delete)
                await connection.execute('DELETE FROM verifications WHERE user_id = ?', [userId]);
                await connection.execute('DELETE FROM activity_logs WHERE user_id = ?', [userId]);

                // 4. Leave Reviews Intact (Referential Integrity), but Anonymize User identity!
                const safeEmail = crypto.randomUUID() + '@anonymized.local';
                await connection.execute(
                    "UPDATE users SET name = 'Deleted User', email = ?, password = NULL, photo_url = NULL, status = 'anonymized', deletion_scheduled_at = NULL WHERE id = ?",
                    [safeEmail, userId]
                );

                console.log(`[GDPR] Successfully anonymized User ID: ${userId}`);
            }

            await connection.commit();
            console.log('[GDPR Cron] Daily sweep completed successfully.');
        } catch (error) {
            console.error('[GDPR Cron] SEVERE ERROR during deletion sweep:', error);
            await connection.rollback();
        } finally {
            connection.release();
        }
    });

    console.log('✅ Background: GDPR Account Deletion Cron Scheduled (Runs daily at midnight)');
};

module.exports = initializeDeletionJob;
