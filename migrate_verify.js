const pool = require('./src/config/database');

async function migrate() {
  try {
    const [cols] = await pool.execute('SHOW COLUMNS FROM users');
    const names = cols.map(c => c.Field);
    
    if (!names.includes('email_verified')) {
      await pool.execute('ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE');
      console.log('Added email_verified');
    }
    if (!names.includes('phone_verified')) {
      await pool.execute('ALTER TABLE users ADD COLUMN phone_verified BOOLEAN DEFAULT FALSE');
      console.log('Added phone_verified');
    }
    
    console.log('Done');
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}

migrate();
