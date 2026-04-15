const pool = require('./src/config/database');
async function check() {
  try {
    const [colsUsers] = await pool.execute("SHOW COLUMNS FROM users");
    console.log('USERS COLUMNS:', colsUsers.map(c => c.Field).join(', '));
    const [colsEntities] = await pool.execute("SHOW COLUMNS FROM entities");
    console.log('ENTITIES COLUMNS:', colsEntities.map(c => c.Field).join(', '));
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
check();
