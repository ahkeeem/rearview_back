const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const verifyToken = async (req, res, next) => {
    try {
        const token = req.headers['authorization']?.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Set the user object with the userId from token
        req.user = {
            userId: decoded.userId  // This matches the token payload structure
        };
        
        console.log('Token decoded:', decoded);
        console.log('User set in request:', req.user);
        next();
    } catch (err) {
        console.error('Authentication error:', err.message);
        res.status(401).json({ error: 'Failed to authenticate token' });
    }
};

module.exports = verifyToken;