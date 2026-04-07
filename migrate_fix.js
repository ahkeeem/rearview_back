const pool = require('./src/config/database');

async function migrate() {
  try {
    console.log('Starting migration...');
    
    // 1. Entity Identifiers Table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS entity_identifiers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        entity_id VARCHAR(36),
        identifier_type ENUM('phone', 'email', 'bvn', 'nin') NOT NULL,
        identifier_value VARCHAR(255) NOT NULL,
        verification_status ENUM('unverified', 'verified') DEFAULT 'unverified',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (entity_id),
        INDEX (identifier_value)
      )
    `);
    console.log('✓ entity_identifiers created');

    // 2. Review Responses Table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS review_responses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        review_id INT NOT NULL,
        responder_id INT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (review_id)
      )
    `);
    console.log('✓ review_responses created');

    // 3. Update Reviews Table
    const [cols] = await pool.execute('SHOW COLUMNS FROM reviews');
    const colNames = cols.map(c => c.Field);

    if (!colNames.includes('proof_tier')) {
      await pool.execute("ALTER TABLE reviews ADD COLUMN proof_tier ENUM('none', 'low', 'high') DEFAULT 'none'");
      console.log('✓ proof_tier added to reviews');
    }
    if (!colNames.includes('dispute_status')) {
      await pool.execute("ALTER TABLE reviews ADD COLUMN dispute_status ENUM('none', 'under_review', 'resolved', 'dismissed') DEFAULT 'none'");
      console.log('✓ dispute_status added to reviews');
    }

    console.log('Migration Successful');
  } catch (err) {
    console.error('Migration Failed:', err);
  } finally {
    process.exit(0);
  }
}

migrate();
