const pool = require('../config/database');

const adminVerificationController = {
    getPendingVerifications: async (req, res) => {
        try {
            const [verifications] = await pool.execute(`
                SELECT v.*, u.name, u.email 
                FROM verifications v
                JOIN users u ON v.user_id = u.id
                WHERE v.status = 'pending'
                ORDER BY v.created_at ASC
            `);
            
            res.json(verifications);
        } catch (err) {
            console.error('Error fetching pending verifications:', err);
            res.status(500).json({ error: 'Failed to fetch pending verifications' });
        }
    },

    reviewVerification: async (req, res) => {
        try {
            const { verificationId } = req.params;
            const { status, reviewNotes } = req.body;
            
            const [result] = await pool.execute(
                'UPDATE verifications SET status = ?, review_notes = ?, reviewed_at = NOW(), reviewed_by = ? WHERE id = ?',
                [status, reviewNotes, req.user.id, verificationId]
            );
            
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Verification not found' });
            }
            
            res.json({ message: 'Verification review completed' });
        } catch (err) {
            console.error('Error reviewing verification:', err);
            res.status(500).json({ error: 'Failed to review verification' });
        }
    }
};

module.exports = adminVerificationController;
