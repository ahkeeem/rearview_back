const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.RENDER_DB_HOST,
    user: process.env.RENDER_DB_USER,
    password: process.env.RENDER_DB_PASSWORD,
    database: process.env.RENDER_DB_NAME,
    port: process.env.RENDER_DB_PORT,
    ssl: {
        rejectUnauthorized: false
    }
});

module.exports = pool;
