const pool = require('../config/database');
const jwt = require('jsonwebtoken');

const verifyAdmin = async (req, res, next) => {
    try {
        const token = req.headers['authorization']?.split(' ')[1];
        
        if (!token) {
            return res.status(403).json({ error: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId || decoded.id;
        
        if (!userId) {
            return res.status(403).json({ error: 'Invalid token payload' });
        }
        
        const [admins] = await pool.execute(
            'SELECT * FROM users WHERE id = ? AND role = "admin"',
            [userId]
        );

        if (!admins.length) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        req.admin = admins[0];
        req.admin.id = admins[0].id; // Ensure id is set
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(403).json({ error: 'Token expired' });
        }
        if (err.name === 'JsonWebTokenError') {
            return res.status(403).json({ error: 'Invalid token' });
        }
        console.error('Admin verification failed:', err);
        res.status(403).json({ error: 'Admin verification failed' });
    }
};

module.exports = verifyAdmin;