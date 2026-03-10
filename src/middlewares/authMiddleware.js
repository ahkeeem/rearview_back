const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const verifyToken = async (req, res, next) => {
    try {
        const token = req.headers['authorization']?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Set the user object with the userId from token
        req.user = {
            userId: decoded.userId,
            id: decoded.userId, // Support both for backward compatibility
            name: decoded.name,
            email: decoded.email
        };
        
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' });
        }
        if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid token' });
        }
        console.error('Authentication error:', err.message);
        res.status(401).json({ error: 'Failed to authenticate token' });
    }
};

module.exports = verifyToken;