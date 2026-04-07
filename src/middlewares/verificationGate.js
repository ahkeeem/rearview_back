const pool = require('../config/database');

/**
 * Middleware that blocks unverified users from interacting.
 * Users can browse/view content but cannot create reviews, send messages,
 * create connections, etc. until they verify at least email or phone.
 */
const requireVerified = async (req, res, next) => {
    try {
        const userId = req.user?.userId || req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const [rows] = await pool.execute(
            'SELECT verification_level FROM users WHERE id = ?',
            [userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const level = rows[0].verification_level;
        if (level === 'none') {
            return res.status(403).json({ 
                error: 'Account verification required',
                message: 'Please verify your email or phone number in Settings before performing this action.',
                requires_verification: true
            });
        }

        next();
    } catch (err) {
        console.error('Verification check error:', err);
        res.status(500).json({ error: 'Failed to check verification status' });
    }
};

module.exports = { requireVerified };
