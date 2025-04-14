const pool = require('../config/database');

const verificationController = {
    submitVerification: async (req, res) => {
        try {
            const { userId, verificationType, verificationData } = req.body;
            
            const [result] = await pool.execute(
                'INSERT INTO verifications (user_id, type, status, data) VALUES (?, ?, ?, ?)',
                [userId, verificationType, 'pending', verificationData]
            );
            
            res.status(201).json({
                message: 'Verification submitted successfully',
                verificationId: result.insertId
            });
        } catch (err) {
            console.error('Error submitting verification:', err);
            res.status(500).json({ error: 'Failed to submit verification' });
        }
    },

    getVerificationStatus: async (req, res) => {
        try {
            const { userId } = req.params;
            
            const [verifications] = await pool.execute(
                'SELECT type, status, created_at FROM verifications WHERE user_id = ?',
                [userId]
            );
            
            res.json(verifications);
        } catch (err) {
            console.error('Error fetching verification status:', err);
            res.status(500).json({ error: 'Failed to fetch verification status' });
        }
    }
};

module.exports = verificationController;