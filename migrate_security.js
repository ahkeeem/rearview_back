const pool = require('./src/config/database');

async function migrate() {
  try {
    console.log('Starting Advanced Security Migration...');
    
    // 1. Hardening Users table
    await pool.execute("ALTER TABLE users MODIFY phone VARCHAR(20) UNIQUE");
    console.log('✓ phone set to UNIQUE in users');

    const [cols] = await pool.execute('SHOW COLUMNS FROM users');
    const colNames = cols.map(c => c.Field);

    if (!colNames.includes('nin_verified')) {
      await pool.execute("ALTER TABLE users ADD COLUMN nin_verified BOOLEAN DEFAULT FALSE");
      console.log('✓ nin_verified added');
    }
    if (!colNames.includes('bvn_verified')) {
      await pool.execute("ALTER TABLE users ADD COLUMN bvn_verified BOOLEAN DEFAULT FALSE");
      console.log('✓ bvn_verified added');
    }

    // 2. OTP Codes Table
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS otp_codes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        code VARCHAR(6) NOT NULL,
        type ENUM('login', 'register', 'verify') NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (user_id),
        INDEX (code)
      )
    `);
    console.log('✓ otp_codes created');

    // 3. Login Attempts (Brute-force protection)
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS login_attempts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ip_address VARCHAR(45) NOT NULL,
        email VARCHAR(255) NOT NULL,
        attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (ip_address),
        INDEX (email)
      )
    `);
    console.log('✓ login_attempts created');

    console.log('Migration Successful');
  } catch (err) {
    console.error('Migration Failed:', err);
  } finally {
    process.exit(0);
  }
}

migrate();
