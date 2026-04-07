const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const multer = require('multer');
const path = require('path');

// Multer Storage for local uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|webp/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only images (jpeg, jpg, png, webp) are allowed!'));
    }
}).single('image');

const userController = {
    // Native Image Upload Handler
    uploadImage: (req, res) => {
        upload(req, res, (err) => {
            if (err) {
                return res.status(400).json({ error: err.message });
            }
            if (!req.file) {
                return res.status(400).json({ error: 'Please select an image file to upload.' });
            }

            // Return full local URL for development
            const imageUrl = `http://localhost:4000/uploads/${req.file.filename}`;
            res.status(200).json({ 
                message: 'Image uploaded successfully',
                imageUrl: imageUrl 
            });
        });
    },

    // Get all users
    getUsers: async (req, res) => {
        try {
            const [rows] = await pool.execute('SELECT * FROM users');
            res.status(200).json(rows); // Return rows from the query
        } catch (err) {
            console.error('Error fetching users:', err.message);
            res.status(500).json({ error: 'An error occurred while fetching users. Please try again later.' });
        }
    },

    // Create a new user
    createUser: async (req, res) => {
        try {
            console.log('Registration payload:', req.body);
            const { name, email, password } = req.body;

            // Validate required fields
            if (!name || !email || !password) {
                console.error('Missing required fields:', { name, email, password });
                return res.status(400).json({ error: 'Name, email, and password are required.' });
            }

            // Hash the password before saving it
            const hashedPassword = await bcrypt.hash(password, 10);

            // SQL query to insert the new user into the database
            const query = 'INSERT INTO users (name, email, password) VALUES (?, ?, ?)';
            const [result] = await pool.execute(query, [name, email, hashedPassword]);

            // Check if insertion was successful
            if (result.affectedRows > 0) {
                const userId = result.insertId;
                
                // [Entity Generation Hub] Assign a generic Entity ID dynamically
                const crypto = require('crypto');
                const uuid = crypto.randomUUID();
                
                await pool.execute("INSERT INTO entities (id, type, name) VALUES (?, 'user', ?)", [uuid, name]);
                await pool.execute("UPDATE users SET entity_id = ? WHERE id = ?", [uuid, userId]);

                return res.status(201).json({
                    message: 'User created successfully',
                    userId: userId,
                    entityId: uuid
                });
            }

            console.error('User creation failed, no rows affected');
            return res.status(500).json({ error: 'User creation failed' });
        } catch (error) {
            console.error('User creation error:', error);

            // Handle duplicate email error
            if (error.code === 'ER_DUP_ENTRY' || (error.message && error.message.includes('Duplicate entry'))) {
                return res.status(409).json({ error: 'Email already exists. Please use a different email.' });
            }

            return res.status(500).json({
                error: 'User creation failed',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    },
    loginUser: async (req, res) => {
        try {
            const { email, password } = req.body;
            
            const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
            if (rows.length === 0) {
                return res.status(400).json({ error: 'Email not found' });
            }

            const user = rows[0];
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(400).json({ error: 'Incorrect password' });
            }

                    // Generate token and create session
                    const token = jwt.sign(
                        { userId: user.id, name: user.name, email: user.email },
                        process.env.JWT_SECRET,
                        { expiresIn: '24h' }
                    );
                    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
            
                    await pool.execute(
                        'INSERT INTO user_sessions (user_id, token, expires_at) VALUES (?, ?, ?)',
                        [user.id, token, expiresAt]
                    );

            // Log activity
            await pool.execute(
                'INSERT INTO activity_logs (user_id, action_type, ip_address) VALUES (?, ?, ?)',
                [user.id, 'LOGIN', req.ip]
            );

            res.status(200).json({
                message: 'Login successful',
                token,
                user: { id: user.id, name: user.name, email: user.email }
            });
        } catch (err) {
            console.error('Error during login:', err.message);
            res.status(500).json({ error: 'An error occurred during login' });
        }
    },

    logout: async (req, res) => {
        try {
            const token = req.headers['authorization']?.split(' ')[1];
            const userId = req.user.userId || req.user.id;
            
            if (token) {
            await pool.execute('DELETE FROM user_sessions WHERE token = ?', [token]);
            }
            
            if (userId) {
            await pool.execute(
                'INSERT INTO activity_logs (user_id, action_type, ip_address) VALUES (?, ?, ?)',
                    [userId, 'LOGOUT', req.ip]
            );
            }

            res.json({ message: 'Logged out successfully' });
        } catch (err) {
            console.error('Error during logout:', err.message);
            res.status(500).json({ error: 'An error occurred during logout' });
        }
    },
    getUserStats: async (req, res) => {
        try {
            const userId = req.params.userId;
            
            // 1. Get Weighted Reviews (Matching trustController.js logic)
            const [weightedResults] = await pool.execute(`
                SELECT 
                    r.*,
                    rv.name as reviewer_name,
                    rv.verification_level as reviewer_v_level,
                    rv.trust_score as reviewer_trust_score,
                    res.content as merchant_response,
                    e.claimed_by_user_id
                FROM reviews r
                JOIN users rv ON r.reviewer_id = rv.id
                JOIN entities e ON r.target_entity_id = e.id
                JOIN users tgt ON r.target_entity_id = tgt.entity_id
                LEFT JOIN review_responses res ON r.id = res.review_id
                WHERE tgt.id = ?
                ORDER BY r.created_at DESC
            `, [userId]);

            let totalWeight = 0;
            let totalWeightedRating = 0;

            const vLevelWeights = { 'none': 1.0, 'phone': 1.5, 'advanced': 2.5 };
            const proofWeights = { 'none': 1.0, 'low': 1.2, 'high': 2.0 };

            weightedResults.forEach(r => {
                let weight = (vLevelWeights[r.reviewer_v_level] || 1.0) + (r.reviewer_trust_score / 100);
                weight *= (proofWeights[r.proof_tier] || 1.0);
                if (r.is_disputed) weight *= 0.5;
                
                totalWeightedRating += (r.rating * weight);
                totalWeight += weight;
            });

            const weightedReviewScore = totalWeight > 0 ? (totalWeightedRating / totalWeight) : 0;
            
            // 2. Verification Score
            const [userRows] = await pool.execute(
                'SELECT verification_level, trust_score as old_score FROM users WHERE id = ?',
                [userId]
            );
            const myVLevel = userRows[0]?.verification_level || 'none';
            const verificationScoreMap = { 'none': 0, 'phone': 50, 'advanced': 100 };
            const verificationScore = verificationScoreMap[myVLevel];
            
            // 3. Connections
            const [connections] = await pool.execute(
                'SELECT COUNT(*) as connection_count FROM connections WHERE (user_id = ? OR connected_user_id = ?) AND status = "accepted"',
                [userId, userId]
            );
            const connectionScore = Math.min((connections[0].connection_count * 10), 100);
            
            const finalTrustScore = Math.round(
                (weightedReviewScore * 20 * 0.6) + 
                (verificationScore * 0.25) + 
                (connectionScore * 0.15)
            );

            res.json({
                trustScore: finalTrustScore,
                reviews: weightedResults.slice(0, 5),
                connectionCount: connections[0].connection_count,
                verificationCount: myVLevel === 'none' ? 0 : (myVLevel === 'phone' ? 1 : 2),
                reviewCount: weightedResults.length,
                breakdown: {
                    reviews: Math.round(weightedReviewScore * 20 * 0.6),
                    verification: Math.round(verificationScore * 0.25),
                    proximity: Math.round(connectionScore * 0.15)
                }
            });
        } catch (err) {
            console.error('Error fetching user stats:', err);
            res.status(500).json({ error: 'Failed to fetch user statistics' });
        }
    },    
    
    searchUsers: async (req, res) => {
        try {
            const searchTerm = req.query.q;
            const callerId = req.user.userId || req.user.id;
            
            const query = `
                SELECT 
                    u.id, 
                    u.name, 
                    u.email,
                    c.status as connectionStatus
                FROM users u
                LEFT JOIN connections c ON 
                    (c.user_id = u.id AND c.connected_user_id = ?) 
                    OR 
                    (c.connected_user_id = u.id AND c.user_id = ?)
                WHERE (u.name LIKE ? OR u.email LIKE ?) AND u.status IN ('active', 'deactivated')
            `;
            const [users] = await pool.execute(query, [callerId, callerId, `%${searchTerm}%`, `%${searchTerm}%`]);
            res.json(users);
        } catch (err) {
            console.error('Error searching users:', err);
            res.status(500).json({ error: 'Failed to search users' });
        }
    },

    getUserProfile: async (req, res) => {
        try {
            const { id } = req.params;
            const [user] = await pool.execute(
                'SELECT id, name, email, bio, headline, location, photo_url, banner_url, phone, website, entity_id, status FROM users WHERE id = ?',
                [id]
            );
            
            if (!user.length) {
                return res.status(404).json({ error: 'User not found' });
            }
            
            res.status(200).json(user[0]);
        } catch (err) {
            console.error('Error fetching user profile:', err.message);
            res.status(500).json({ error: 'Failed to fetch user profile' });
        }
    },
    
    updateProfile: async (req, res) => {
        try {
            const { id } = req.params;
            const { name, email, bio, headline, location, photo_url, banner_url, phone, website } = req.body;

            // Build dynamic SET clause from provided fields
            const fields = [];
            const values = [];
            if (name !== undefined) { fields.push('name = ?'); values.push(name); }
            if (email !== undefined) { fields.push('email = ?'); values.push(email); }
            if (bio !== undefined) { fields.push('bio = ?'); values.push(bio); }
            if (headline !== undefined) { fields.push('headline = ?'); values.push(headline); }
            if (location !== undefined) { fields.push('location = ?'); values.push(location); }
            if (photo_url !== undefined) { fields.push('photo_url = ?'); values.push(photo_url); }
            if (banner_url !== undefined) { fields.push('banner_url = ?'); values.push(banner_url); }
            if (phone !== undefined) { fields.push('phone = ?'); values.push(phone); }
            if (website !== undefined) { fields.push('website = ?'); values.push(website); }

            if (fields.length === 0) {
                return res.status(400).json({ error: 'No fields to update' });
            }

            values.push(id);
            const [result] = await pool.execute(
                `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
                values
            );
            
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'User not found' });
            }
            
            // Sync entity name if name changed
            if (name !== undefined) {
                await pool.execute('UPDATE entities SET name = ? WHERE id = (SELECT entity_id FROM users WHERE id = ?)', [name, id]).catch(() => {});
            }

            res.status(200).json({ message: 'Profile updated successfully' });
        } catch (err) {
            console.error('Error updating profile:', err.message);
            res.status(500).json({ error: 'Failed to update profile' });
        }
    },

    deleteAccount: async (req, res) => {
        const connection = await pool.getConnection();
        try {
            const { id } = req.params;
            const userId = req.user.userId || req.user.id;
            
            // Authorization Check
            if (parseInt(id) !== parseInt(userId)) {
                return res.status(403).json({ error: 'Unauthorized to delete this account.' });
            }

            await connection.beginTransaction();

            // 1. Delete active sessions immediately to log them out
            await connection.execute('DELETE FROM user_sessions WHERE user_id = ?', [userId]);

            // 2. Clear Active Connections immediately (so they drop off networks)
            await connection.execute('DELETE FROM connections WHERE user_id = ? OR connected_user_id = ?', [userId, userId]);

            // 3. Mark User as pending_deletion with a 30 day grace window
            const [result] = await connection.execute(
                "UPDATE users SET status = 'pending_deletion', deletion_scheduled_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 30 DAY), email = CONCAT(id, '_deleted@local'), photo_url = NULL WHERE id = ?",
                [userId]
            );

            if (result.affectedRows === 0) {
                await connection.rollback();
                return res.status(404).json({ error: 'User not found' });
            }

            await connection.commit();
            res.status(200).json({ message: 'Account deactivated. It will be permanently deleted after 30 days.' });
        } catch (err) {
            await connection.rollback();
            console.error('Error initiating account deletion:', err);
            res.status(500).json({ error: 'An error occurred during account deactivation' });
        } finally {
            connection.release();
        }
    },

    submitVerification: async (req, res) => {
        try {
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
            const userId = req.user.userId || req.user.id;
            
            const [verifications] = await pool.execute(
                'SELECT status, created_at FROM verifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
                [userId]
            );

            res.json(verifications[0] || { status: 'none' });
        } catch (err) {
            console.error('Error fetching verification status:', err);
            res.status(500).json({ error: 'Failed to fetch verification status' });
        }
    },
    
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
            res.status(500).json({ error: 'Failed to fetch verifications' });
        }
    }
};

module.exports = userController;



