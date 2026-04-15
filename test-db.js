const pool = require('./src/config/database');
async function test() {
    try {
        const [rows] = await pool.execute("DESCRIBE reviews");
        console.log("Reviews schema:", rows.map(r => r.Field));
        
        const [afRows] = await pool.execute("DESCRIBE activity_feed");
        console.log("Activity feed schema:", afRows.map(r => r.Field));
    } catch(err) {
        console.error(err);
    }
    process.exit(0);
}
test();
