const pool = require('../config/database');

const trustController = {
    calculateTrustScore: async (req, res) => {
        try {
            const { userId } = req.params;
            
            // Calculate based on multiple factors
            const [reviews] = await pool.execute(
                'SELECT AVG(rating) as review_score FROM reviews WHERE reviewee_id = ?',
                [userId]
            );
            
            const [verifications] = await pool.execute(
                'SELECT COUNT(*) as verify_count FROM verifications WHERE user_id = ?',
                [userId]
            );
            
            const [connections] = await pool.execute(
                'SELECT COUNT(*) as connection_count FROM connections WHERE user_id = ?',
                [userId]
            );
            
            // Trust score formula: 
            // (Review Score * 0.6) + (Verification Score * 0.25) + (Connection Score * 0.15)
            const reviewScore = reviews[0].review_score || 0;
            const verificationScore = Math.min((verifications[0].verify_count * 20), 100);
            const connectionScore = Math.min((connections[0].connection_count * 10), 100);
            
            const trustScore = (
                (reviewScore * 0.6) + 
                (verificationScore * 0.25) + 
                (connectionScore * 0.15)
            );
            
            res.json({
                trustScore: Math.round(trustScore),
                components: {
                    reviewScore: Math.round(reviewScore),
                    verificationScore,
                    connectionScore
                }
            });
        } catch (err) {
            console.error('Error calculating trust score:', err);
            res.status(500).json({ error: 'Failed to calculate trust score' });
        }
    }
};

module.exports = trustController;
