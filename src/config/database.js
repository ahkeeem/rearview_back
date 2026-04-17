require('dotenv').config();
const mysql = require('mysql2');

// Allow simple local defaults for development only
const isProduction = process.env.NODE_ENV === 'production';

const DB_HOST = process.env.DB_HOST;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD || process.env.DB_PASS;
const DB_NAME = process.env.DB_NAME;
const DB_PORT = process.env.DB_PORT || 4000; // TiDB Cloud defaults to 4000

// Validate required environment variables
if (!DB_HOST || !DB_USER || !DB_NAME || !DB_PASSWORD) {
    const isDev = process.env.NODE_ENV !== 'production';
    console.error('❌ Missing required database environment variables');
    if (isDev) {
        console.log('Ensure DB_HOST, DB_USER, DB_NAME, and DB_PASSWORD are set in your .env file.');
    }
    throw new Error('Database configuration is incomplete');
}

const poolConfig = {
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    port: DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: false
    }
};

const pool = mysql.createPool(poolConfig);

// Test connection
pool.getConnection((err, connection) => {
    if (err) {
        console.error('Database connection error:', err.message);
    } else {
        console.log('Database connected successfully');
        connection.release();
    }
});

module.exports = pool.promise();