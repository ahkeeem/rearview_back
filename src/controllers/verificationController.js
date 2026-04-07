const pool = require('../config/database');

const verificationController = {
    // Simulated NIN Verification (NIMC Mock)
    verifyNIN: async (req, res) => {
        try {
            const userId = req.user.userId || req.user.id;
            const { nin } = req.body;

            if (!nin || nin.length !== 11) {
                return res.status(400).json({ error: 'Please provide a valid 11-digit NIN.' });
            }

            // [MOCK] Simulation logic: 00000000000 fails, others succeed
            if (nin === '00000000000') {
              return res.status(422).json({ error: 'NIN could not be verified with NIMC.' });
            }

            // Update user status
            await pool.execute(
                "UPDATE users SET nin_verified = TRUE, verification_level = 'advanced' WHERE id = ?",
                [userId]
            );

            // Log activity
            await pool.execute(
                'INSERT INTO activity_logs (user_id, action_type, metadata) VALUES (?, ?, ?)',
                [userId, 'IDENTITY_VERIFIED', JSON.stringify({ type: 'NIN' })]
            );

            res.json({ message: 'NIN Verified Successfully. Identity status upgraded.' });
        } catch (err) {
            console.error('NIN Verification Error:', err);
            res.status(500).json({ error: 'Failed to complete NIN verification.' });
        }
    },

    // Simulated BVN Verification (NIBSS Mock)
    verifyBVN: async (req, res) => {
        try {
            const userId = req.user.userId || req.user.id;
            const { bvn } = req.body;

            if (!bvn || bvn.length !== 11) {
                return res.status(400).json({ error: 'Please provide a valid 11-digit BVN.' });
            }

            // [MOCK] Simulation logic
            if (bvn === '99999999999') {
              return res.status(422).json({ error: 'BVN mismatch with bank records.' });
            }

            await pool.execute(
                "UPDATE users SET bvn_verified = TRUE, verification_level = 'advanced' WHERE id = ?",
                [userId]
            );

            res.json({ message: 'BVN Verified Successfully.' });
        } catch (err) {
            console.error('BVN Verification Error:', err);
            res.status(500).json({ error: 'Failed to complete BVN verification.' });
        }
    }
};

module.exports = verificationController;