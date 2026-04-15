const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('FATAL: JWT_SECRET environment variable is not set.');


const verifyToken = async (req, res, next) => {
    try {
        const token = req.headers['authorization']?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = {
            userId: decoded.userId,
            id: decoded.userId,
            name: decoded.name,
            email: decoded.email
        };
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired' });
        if (err.name === 'JsonWebTokenError') return res.status(401).json({ error: 'Invalid token' });
        res.status(401).json({ error: 'Failed to authenticate token' });
    }
};

const optionalVerify = async (req, res, next) => {
    try {
        const token = req.headers['authorization']?.split(' ')[1];
        if (!token) return next();
        
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = {
            userId: decoded.userId,
            id: decoded.userId,
            name: decoded.name,
            email: decoded.email
        };
        next();
    } catch (err) {
        // If token is invalid or expired, we just treat them as guest
        next();
    }
};

module.exports = { verifyToken, optionalVerify };