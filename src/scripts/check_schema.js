const pool = require('../config/database');

async function checkSchema() {
    try {
        const [rows] = await pool.execute('DESCRIBE activity_feed');
        console.log(JSON.stringify(rows, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkSchema();
