const pool = require('../config/database');

async function run() {
    try {
        console.log('Running Schema Upgrades...');
        
        // 1. Update Users Table for GDPR
        try {
            await pool.execute("ALTER TABLE users ADD COLUMN status ENUM('active', 'deactivated', 'pending_deletion', 'anonymized') DEFAULT 'active'");
            await pool.execute("ALTER TABLE users ADD COLUMN deletion_scheduled_at TIMESTAMP NULL DEFAULT NULL");
            console.log('- User GDPR schema updated');
        } catch (e) {
            console.log('- User GDPR schema already updated or error: ' + e.message);
        }

        // 2. Create Entities Table
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS entities (
                id VARCHAR(36) PRIMARY KEY,
                type ENUM('user', 'business', 'product') NOT NULL,
                name VARCHAR(255) NOT NULL,
                description TEXT NULL,
                avatar_url VARCHAR(255) NULL,
                claimed_by_user_id INT NULL,
                canonical_id VARCHAR(36) NULL,
                sentiment_score FLOAT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (claimed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
                FOREIGN KEY (canonical_id) REFERENCES entities(id) ON DELETE SET NULL
            )
        `);
        console.log('- Entities table created');

        // 3. Link Users to Entities
        try {
            await pool.execute("ALTER TABLE users ADD COLUMN entity_id VARCHAR(36) NULL");
            console.log('- entity_id added to users table');
        } catch (e) {
            console.log('- entity_id column already added or error: ' + e.message);
        }

        // Backfill generic entities for existing users
        const [usersWithoutEntity] = await pool.execute('SELECT id, name FROM users WHERE entity_id IS NULL');
        if (usersWithoutEntity.length > 0) {
            console.log(`- Backfilling ${usersWithoutEntity.length} legacy users with baseline entities...`);
            for (let u of usersWithoutEntity) {
                const uuid = crypto.randomUUID();
                await pool.execute("INSERT INTO entities (id, type, name) VALUES (?, 'user', ?)", [uuid, u.name]);
                await pool.execute("UPDATE users SET entity_id = ? WHERE id = ?", [uuid, u.id]);
            }
        }

        // 4. Update Reviews to target generic Entities instead of Users
        try {
            // First we need target_entity_id
            await pool.execute("ALTER TABLE reviews ADD COLUMN target_entity_id VARCHAR(36) NULL");
            await pool.execute("ALTER TABLE reviews ADD COLUMN sentiment ENUM('positive', 'neutral', 'negative') NULL");
            console.log('- reviews schema updated to support polymorphic targets & sentiments');
            
            // Migrate: For every review targeting a user, map their target_entity_id to that user's generated entity_id
            await pool.execute(`
                UPDATE reviews r 
                INNER JOIN users u ON r.reviewee_id = u.id 
                SET r.target_entity_id = u.entity_id 
                WHERE r.target_entity_id IS NULL AND r.reviewee_id IS NOT NULL
            `);
            console.log('- historical reviews safely repointed to their counterpart baseline entities');
            
            // Optional: Drop the foreign key / column (leaving it for safety and backwards compatibility temporarily)
        } catch (e) {
            console.log('- reviews schema already updated or error: ' + e.message);
        }

        // 5. Activity Feed Table
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS activity_feed (
                id INT AUTO_INCREMENT PRIMARY KEY,
                actor_id INT NOT NULL,
                action_type ENUM('wrote_review', 'connected', 'created_post') NOT NULL,
                target_id VARCHAR(255) NULL,
                target_entity_id VARCHAR(36) NULL,
                action_data JSON NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (target_entity_id) REFERENCES entities(id) ON DELETE CASCADE
            )
        `);
        console.log('- Activity Feed table created');

        // 6. Threads / Discussions
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS threads (
                id INT AUTO_INCREMENT PRIMARY KEY,
                entity_id VARCHAR(36) NOT NULL,
                title VARCHAR(255) NOT NULL,
                author_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE,
                FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        
        await pool.execute(`
            CREATE TABLE IF NOT EXISTS comments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                thread_id INT NOT NULL,
                author_id INT NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE,
                FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        console.log('- Threads & Comments tables created');

        console.log('✅ Schema Upgrade Complete!');
        process.exit(0);
    } catch (e) {
        console.error('CRITICAL ERROR DURING MIGRATION:', e);
        process.exit(1);
    }
}

run();
