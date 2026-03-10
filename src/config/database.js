require('dotenv').config();
const mysql = require('mysql2');

// Allow simple local defaults for development only
const isProduction = process.env.NODE_ENV === 'production';

const DB_HOST = process.env.DB_HOST || (isProduction ? null : 'gateway01.eu-central-1.prod.aws.tidbcloud.com');
const DB_USER = process.env.DB_USER || (isProduction ? null : '2at3j1JbUa6h767.root');
const DB_PASSWORD = process.env.DB_PASSWORD || process.env.DB_PASS || (isProduction ? null : 'IPZHlE3kn5NX4Ncb');
const DB_NAME = process.env.DB_NAME || (isProduction ? null : 'test');
const DB_PORT = process.env.DB_PORT || 4000;

// Validate required environment variables
if (!DB_HOST || !DB_USER || !DB_NAME || !DB_PASSWORD) {
    console.error('Missing required database environment variables');
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
        rejectUnauthorized: true
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