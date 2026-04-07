const pool = require('../config/database');

const trustController = {
    calculateTrustScore: async (req, res) => {
        try {
            const { userId } = req.params;
            
            // 1. Weighted Review Score (The "Core Trust Signal")
            // Join reviews with the reviewers to get their weights
            const [weightedResults] = await pool.execute(`
                SELECT 
                    r.rating,
                    r.is_disputed,
                    r.proof_tier,
                    rv.verification_level as reviewer_v_level,
                    rv.trust_score as reviewer_trust_score
                FROM reviews r
                JOIN users rv ON r.reviewer_id = rv.id
                JOIN users tgt ON r.target_entity_id = tgt.entity_id
                WHERE tgt.id = ?
            `, [userId]);

            let totalWeight = 0;
            let totalWeightedRating = 0;

            const vLevelWeights = { 'none': 1.0, 'phone': 1.5, 'advanced': 2.5 };
            const proofWeights = { 'none': 1.0, 'low': 1.2, 'high': 2.0 };

            weightedResults.forEach(r => {
                let weight = (vLevelWeights[r.reviewer_v_level] || 1.0) + (r.reviewer_trust_score / 100);
                
                // 1.1 Proof Tier Multiplier
                weight *= (proofWeights[r.proof_tier] || 1.0);

                // 1.2 Penalty: If review is disputed, halve its weight
                if (r.is_disputed) {
                    weight *= 0.5;
                }
                
                totalWeightedRating += (r.rating * weight);
                totalWeight += weight;
            });

            const weightedReviewScore = totalWeight > 0 ? (totalWeightedRating / totalWeight) : 0;
            
            // 2. Verification Score
            const [userRows] = await pool.execute(
                'SELECT verification_level, trust_score as old_score, nin_verified, bvn_verified FROM users WHERE id = ?',
                [userId]
            );
            
            const user = userRows[0] || {};
            const myVLevel = user.verification_level || 'none';
            const oldScore = user.old_score || 0;
            
            const verificationScoreMap = { 'none': 0, 'phone': 50, 'advanced': 50 }; // Base scores
            let verificationScore = verificationScoreMap[myVLevel] || 0;
            
            // Identity Bonuses (High-Tier Registry)
            if (user.nin_verified) verificationScore += 25;
            if (user.bvn_verified) verificationScore += 25;
            
            // Cap at 100
            verificationScore = Math.min(100, verificationScore);
            
            // 3. Proximity Score (Connections)
            const [connections] = await pool.execute(
                'SELECT COUNT(*) as connection_count FROM connections WHERE (user_id = ? OR connected_user_id = ?) AND status = "accepted"',
                [userId, userId]
            );
            const connectionScore = Math.min((connections[0].connection_count * 10), 100);
            
            // Final Trust Score Calculation (0-100)
            const trustScore = (
                (weightedReviewScore * 20 * 0.6) + 
                (verificationScore * 0.25) + 
                (connectionScore * 0.15)
            );
            
            const finalScore = Math.round(Math.min(100, trustScore));
            const scoreTrend = finalScore > oldScore ? 'up' : (finalScore < oldScore ? 'down' : 'stable');

            // Sync with users table
            await pool.execute('UPDATE users SET trust_score = ? WHERE id = ?', [finalScore, userId]);

            res.json({
                trustScore: finalScore,
                scoreTrend: scoreTrend,
                components: {
                    weightedReviewScore: Number(weightedReviewScore.toFixed(2)),
                    verificationLevel: myVLevel,
                    connectionCount: connections[0].connection_count,
                    breakdown: {
                        reviews: Math.round(weightedReviewScore * 20 * 0.6),
                        verification: Math.round(verificationScore * 0.25),
                        proximity: Math.round(connectionScore * 0.15)
                    }
                }
            });
        } catch (err) {
            console.error('Error calculating trust score:', err);
            res.status(500).json({ error: 'Failed to calculate trust score' });
        }
    }
};

module.exports = trustController;
