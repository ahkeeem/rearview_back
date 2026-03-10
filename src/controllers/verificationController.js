const pool = require('../config/database');

const verificationController = {
    submitVerification: async (req, res) => {
        try {
            // Use authenticated user ID, not from request body (security fix)
            const userId = req.user.userId || req.user.id;
            const { document_url } = req.body;
            
            if (!document_url) {
                return res.status(400).json({ error: 'Document URL is required' });
            }
            
            const [result] = await pool.execute(
                'INSERT INTO verifications (user_id, document_url, status) VALUES (?, ?, "pending")',
                [userId, document_url]
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
            // Use authenticated user ID or from params
            const userId = req.user?.userId || req.user?.id || req.params.userId;
            
            if (!userId) {
                return res.status(400).json({ error: 'User ID is required' });
            }
            
            const [verifications] = await pool.execute(
                'SELECT status, document_url, created_at FROM verifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
                [userId]
            );
            
            res.json(verifications[0] || { status: 'none' });
        } catch (err) {
            console.error('Error fetching verification status:', err);
            res.status(500).json({ error: 'Failed to fetch verification status' });
        }
    }
};

module.exports = verificationController;