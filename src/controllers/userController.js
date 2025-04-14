// src/controllers/userController.js
const bcrypt = require('bcrypt'); // bcrypt for password hashing
const jwt = require('jsonwebtoken');
const pool = require('../config/database'); // Assuming you're using MySQL

const userController = {
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
            const { name, email, password } = req.body; // Assuming you're using only name, email, password for registration

            // Validate required fields
            if (!name || !email || !password) {
                console.error("Missing required fields:", { name, email, password });
                return res.status(400).json({ error: 'Name, email, and password are required.' });
            }

            // Hash the password before saving it
            const hashedPassword = await bcrypt.hash(password, 10); // Hash password

            // SQL query to insert the new user into the database
            const query = 'INSERT INTO users (name, email, password) VALUES (?, ?, ?)';
            const [result] = await pool.execute(query, [name, email, hashedPassword]);

            // Check if insertion was successful
            if (result.affectedRows > 0) {
                res.status(201).json({
                    message: 'User created successfully',
                    userId: result.insertId
                });
            } else {
                res.status(500).json({ error: 'An error occurred while creating the user. Please try again later.' });
            }
        } catch (err) {
            console.error("Error during user creation:", err.message);
            res.status(500).json({ error: 'An error occurred while creating the user. Please try again later.' });
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
                        { id: user.id },  // Make sure 'id' is included
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
            
            await pool.execute('DELETE FROM user_sessions WHERE token = ?', [token]);
            
            await pool.execute(
                'INSERT INTO activity_logs (user_id, action_type, ip_address) VALUES (?, ?, ?)',
                [req.user.id, 'LOGOUT', req.ip]
            );

            res.json({ message: 'Logged out successfully' });
        } catch (err) {
            console.error('Error during logout:', err.message);
            res.status(500).json({ error: 'An error occurred during logout' });
        }
    },
    getUserStats: async (req, res) => {
        try {
            const userId = req.params.userId;
            
            // Get weighted reviews with time decay
            const [reviews] = await pool.execute(`
                SELECT 
                    r.*,
                    u.name as reviewer_name,
                    EXP(-DATEDIFF(CURRENT_TIMESTAMP, r.created_at)/365) as time_weight
                FROM reviews r 
                JOIN users u ON r.reviewer_id = u.id
                WHERE r.reviewee_id = ?
                ORDER BY r.created_at DESC
            `, [userId]);
            
            // Keep reviews in 0-5 range but scale up the final trust score
            const weightedScore = reviews.reduce((acc, review) => 
                acc + (review.rating * review.time_weight), 0) / 
                (reviews.reduce((acc, review) => acc + review.time_weight, 0) || 1);
            
            const [verifications] = await pool.execute(
                'SELECT COUNT(*) as verification_count FROM verifications WHERE user_id = ? AND status = "approved"',
                [userId]
            );

            const [connections] = await pool.execute(
                'SELECT COUNT(*) as connection_count FROM connections WHERE (user_id = ? OR connected_user_id = ?) AND status = "accepted"',
                [userId, userId]
            );

            // Calculate final trust score on 0-100 scale
            const finalTrustScore = (
                (weightedScore * 0.6 * 20) +                                      // 60% weight, scaled to 100
                (Math.min(verifications[0].verification_count, 1) * 0.25 * 100) + // 25% weight
                (Math.min(connections[0].connection_count / 10, 1) * 0.15 * 100)  // 15% weight
            );

            res.json({
                trustScore: Math.round(Math.min(100, finalTrustScore)),
                reviews: reviews.slice(0, 5),
                connectionCount: connections[0].connection_count,
                verificationCount: verifications[0].verification_count,
                reviewCount: reviews.length
            });
        } catch (err) {
            console.error('Error fetching user stats:', err);
            res.status(500).json({ error: 'Failed to fetch user statistics' });
        }
    
    },    
    
    searchUsers: async (req, res) => {
        try {
            const searchTerm = req.query.q;
            const query = `
                SELECT id, name, email 
                FROM users 
                WHERE name LIKE ? OR email LIKE ?
            `;
            const [users] = await pool.execute(query, [`%${searchTerm}%`, `%${searchTerm}%`]);
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
                'SELECT id, name, email, created_at FROM users WHERE id = ?',
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
            const { name, email } = req.body;
            
            const [result] = await pool.execute(
                'UPDATE users SET name = ?, email = ? WHERE id = ?',
                [name, email, id]
            );
            
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'User not found' });
            }
            
            res.status(200).json({ message: 'Profile updated successfully' });
        } catch (err) {
            console.error('Error updating profile:', err.message);
            res.status(500).json({ error: 'Failed to update profile' });
        }
    },
    submitVerification: async (req, res) => {
        try {
            const userId = req.user.id;
            const { document_url } = req.body;
            
            const [result] = await pool.execute(
                'INSERT INTO verifications (user_id, document_url) VALUES (?, ?)',
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
            const userId = req.user.id;
            
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

    reviewVerification: async (req, res) => {
        try {
            const { verificationId } = req.params;
            const { status } = req.body;
            const adminId = req.user.id;
    
            const [result] = await pool.execute(
                `UPDATE verifications 
                 SET status = ?, reviewed_by = ? 
                 WHERE id = ?`,
                [status, adminId, verificationId]
            );
    
            if (status === 'approved') {
                await pool.execute(
                    'UPDATE users SET is_verified = TRUE WHERE id = (SELECT user_id FROM verifications WHERE id = ?)',
                    [verificationId]
                );
            }
    
            res.json({ message: 'Verification reviewed successfully' });
        } catch (err) {
            console.error('Error reviewing verification:', err);
            res.status(500).json({ error: 'Failed to review verification' });
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
    },

    reviewVerification: async (req, res) => {
        try {
            const { verificationId } = req.params;
            const { status } = req.body;
            const adminId = req.admin.id; // Changed from req.user.id to req.admin.id

            const [result] = await pool.execute(
                `UPDATE verifications 
                 SET status = ? 
                 WHERE id = ?`,
                [status, verificationId]
            );

            res.json({ message: 'Verification reviewed successfully' });
        } catch (err) {
            console.error('Error reviewing verification:', err);
            res.status(500).json({ error: 'Failed to review verification' });
        }
    }
};

module.exports = userController;



