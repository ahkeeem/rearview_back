const cron = require('node-cron');
const pool = require('../config/database');
const BarterEngine = require('../services/barter/BarterEngine');
const InMemoryGraphAdapter = require('../services/barter/InMemoryGraphAdapter');

// Construct the Barter Engine using our InMemory Adapter (Option A)
// Note: When migrating to Option B, this is the ONLY line of code you change!
const graphAdapter = new InMemoryGraphAdapter();
const barterEngine = new BarterEngine(graphAdapter);

/**
 * Executes the background matchmaker algorithm.
 */
async function executeMatchmaker() {
    console.log('[BarterMatchmaker] ⏱️ Starting circular match check...');
    let conn;
    try {
        conn = await pool.getConnection();

        // 1. Fetch available items
        const [items] = await conn.execute(`
            SELECT id, user_id, item_name, want_category 
            FROM barter_items 
            WHERE status = 'available'
        `);

        if (items.length < 2) {
            console.log('[BarterMatchmaker] Not enough items to loop. Sleeping.');
            return;
        }

        // 2. Fetch Trust Scores for these users
        const userIds = [...new Set(items.map(i => i.user_id))];
        const placeholders = userIds.map(() => '?').join(',');
        const [users] = await conn.execute(`
            SELECT id, trust_score 
            FROM users 
            WHERE id IN (${placeholders})
        `, userIds);

        const userTrustMap = {};
        users.forEach(u => {
            userTrustMap[u.id] = { trustScore: u.trust_score };
        });

        // 3. Process matches mathematically
        const validatedLoops = await barterEngine.evaluateAndBuildLoops(items, userTrustMap);

        if (validatedLoops.length === 0) {
            console.log('[BarterMatchmaker] No new circular matches found.');
            return;
        }

        console.log(`[BarterMatchmaker] 🚀 Processing ${validatedLoops.length} valid loops to DB...`);

        // 4. Save the loops inside a database transaction to guarantee atomicity
        await conn.beginTransaction();

        for (const loop of validatedLoops) {
            // Lock the items so they can't be traded elsewhere in another loop
            const loopItemIds = loop.matrix.map(m => m.item_id);
            const itemPlacements = loopItemIds.map(() => '?').join(',');
            await conn.execute(`
                UPDATE barter_items 
                SET status = 'locked' 
                WHERE id IN (${itemPlacements})
            `, loopItemIds);

            // Create the primary tradeoff loop
            await conn.execute(`
                INSERT INTO trade_loops (id, loop_trust_avg, status, expires_at)
                VALUES (?, ?, 'pending', DATE_ADD(NOW(), INTERVAL 48 HOUR))
            `, [loop.loop_id, loop.loop_trust_avg]);

            // Create individual transactions maps
            for (const leg of loop.matrix) {
                await conn.execute(`
                    INSERT INTO trade_transactions (loop_id, from_user_id, to_user_id, item_id, status)
                    VALUES (?, ?, ?, ?, 'pending')
                `, [loop.loop_id, leg.from_user_id, leg.to_user_id, leg.item_id]);
            }
        }

        await conn.commit();
        console.log('[BarterMatchmaker] ✅ Successfully committed loop transactions.');
        
        // TODO: Emitting WS notifications to all users involved in these loops goes here.

    } catch (error) {
        if (conn) await conn.rollback().catch(() => {});
        console.error('[BarterMatchmaker] ❌ Error executing matchmaker:', error);
    } finally {
        if (conn) conn.release();
    }
}

/**
 * Initializes the cron job to run the matchmaker periodically.
 */
function initializeBarterMatchmakerJob() {
    // Schedule to run every hour on the 0th minute (e.g. 1:00, 2:00, etc)
    cron.schedule('0 * * * *', async () => {
        await executeMatchmaker();
    });
    console.log('[Jobs] 🔄 Barter Matchmaker job initialized (runs every hour).');
}

module.exports = { initializeBarterMatchmakerJob, executeMatchmaker };
