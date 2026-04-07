const pool = require('../config/database');

async function migrate() {
    try {
        console.log('Adding is_verified to reviews table...');
        await pool.execute('ALTER TABLE reviews ADD COLUMN is_verified BOOLEAN DEFAULT FALSE');
        console.log('Successfully added is_verified column.');
        process.exit(0);
    } catch (err) {
        if (err.code === 'ER_DUP_COLUMN_NAME') {
            console.log('Column is_verified already exists.');
            process.exit(0);
        }
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
