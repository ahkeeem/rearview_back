const mysql = require('mysql2/promise');

const config = {
    host: '127.0.0.1',  // Using IP instead of localhost
    user: 'root',
    password: '',
    database: 'rearview',
    port: 3306,
    authPluginName: 'mysql_native_password'  // Explicitly set auth method
};

async function verifyConnection() {
    const pool = mysql.createPool(config);
    try {
        console.log('Connecting to MySQL...');
        const [result] = await pool.query('SELECT 1');
        console.log('Success!');
    } catch (error) {
        console.log('Error details:', {
            message: error.message,
            code: error.code,
            state: error.sqlState
        });
    }
}

verifyConnection();
