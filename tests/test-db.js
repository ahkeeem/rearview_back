const pool = require('../src/config/database');

const testConnection = async () => {
    try {
        const [result] = await pool.query('SELECT 1');
        console.log('Database connection successful!');
        console.log('Test query result:', result);
    } catch (err) {
        console.error('Database connection error:', err.message);
        console.error('Full error details:', err);
    } finally {
        try {
            await pool.end(); // Make sure to close the pool
            console.log('Connection closed.');
        } catch (closeError) {
            console.error('Error closing the connection:', closeError.message);
        }
    }
};

testConnection();
