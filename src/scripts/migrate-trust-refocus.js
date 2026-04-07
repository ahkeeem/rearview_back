const pool = require('../config/database');

async function migrateTrustInfrastructure() {
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        console.log('Starting migration for Trust Infrastructure Refocus...');

        // 1. Upgrade User Verification Tiers
        console.log('Upgrading User Verification Level...');
        // Rename is_verified to verification_level and handle data migration
        await connection.execute(`
            ALTER TABLE users 
            ADD COLUMN verification_level ENUM('none', 'phone', 'advanced') DEFAULT 'none' AFTER is_verified
        `);
        
        await connection.execute(`
            UPDATE users SET verification_level = 'phone' WHERE is_verified = 1
        `);
        await connection.execute(`
            UPDATE users SET verification_level = 'none' WHERE is_verified = 0 OR is_verified IS NULL
        `);
        
        await connection.execute(`
            ALTER TABLE users DROP COLUMN is_verified
        `);

        // 2. Add Phone to Entities for Clustering
        console.log('Adding Phone to Entities...');
        await connection.execute(`
            ALTER TABLE entities 
            ADD COLUMN phone VARCHAR(20) DEFAULT NULL,
            ADD INDEX idx_entity_phone (phone)
        `);

        // 3. Add Review Trust Metadata
        console.log('Adding Review Trust Metadata...');
        await connection.execute(`
            ALTER TABLE reviews 
            ADD COLUMN interaction_type ENUM('transaction', 'service', 'general') DEFAULT 'general',
            ADD COLUMN proof_url TEXT DEFAULT NULL,
            ADD COLUMN is_disputed BOOLEAN DEFAULT FALSE,
            ADD COLUMN dispute_reason TEXT DEFAULT NULL
        `);

        // 4. Activity Logs for Dispute Tracking
        console.log('Ensuring Activity Feed supports Dispute events...');
        await connection.execute(`
            ALTER TABLE activity_feed 
            MODIFY COLUMN action_type ENUM('review_posted', 'connection_request', 'dispute_raised', 'dispute_resolved', 'verification_upgrade', 'entity_registered')
        `);

        await connection.commit();
        console.log('Migration completed successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        if (connection) await connection.rollback();
        process.exit(1);
    } finally {
        if (connection) connection.release();
    }
}

migrateTrustInfrastructure();
