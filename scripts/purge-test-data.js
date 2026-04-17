const pool = require('../src/config/database');

/**
 * purge-test-data.js
 * Wipes all user-generated data for a clean production start.
 * USAGE: node scripts/purge-test-data.js
 */
async function purgeData() {
    console.log('[Purge] ⚠️ CRITICAL: Starting database purge...');
    
    // Ordered to avoid foreign key constraint issues (children first)
    const tablesToPurge = [
        'trade_transactions',
        'trade_loops',
        'barter_items',
        'transactions',
        'escrow_orders',
        'wallets',
        'review_responses',
        'reviews',
        'activity_feed',
        'messages',
        'conversation_participants',
        'conversations',
        'connections',
        'verifications',
        'reports',
        'otp_codes',
        'login_attempts',
        'activity_logs',
        'threads',
        'comments',
        'entities',
        'users'
    ];

    const conn = await pool.getConnection();
    try {
        await conn.execute('SET FOREIGN_KEY_CHECKS = 0');
        
        for (const table of tablesToPurge) {
            try {
                await conn.execute(`TRUNCATE TABLE ${table}`);
                console.log(`[Purge] ✓ Truncated ${table}`);
            } catch (err) {
                console.warn(`[Purge] ! Could not truncate ${table}: ${err.message}`);
            }
        }

        await conn.execute('SET FOREIGN_KEY_CHECKS = 1');
        console.log('[Purge] ✅ Database purged successfully.');
        
    } catch (err) {
        console.error('[Purge] ✗ FATAL ERROR:', err);
    } finally {
        conn.release();
        process.exit(0);
    }
}

purgeData();
