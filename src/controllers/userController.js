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
                return res.status(201).json({
                    message: 'User created successfully',
                    userId: result.insertId
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

            // 1. Delete messages authored by user
            await connection.execute('DELETE FROM messages WHERE sender_id = ?', [userId]);

            // 2. Remove user from conversation participants
            await connection.execute('DELETE FROM conversation_participants WHERE user_id = ?', [userId]);

            // 3. Delete connections where user is involved
            await connection.execute('DELETE FROM connections WHERE user_id = ? OR connected_user_id = ?', [userId, userId]);

            // 4. Delete verifications
            await connection.execute('DELETE FROM verifications WHERE user_id = ?', [userId]);

            // 5. Delete activity logs
            await connection.execute('DELETE FROM activity_logs WHERE user_id = ?', [userId]);

            // 6. Delete reviews given/received
            await connection.execute('DELETE FROM reviews WHERE reviewer_id = ? OR reviewee_id = ?', [userId, userId]);

            // 7. Delete user sessions
            await connection.execute('DELETE FROM user_sessions WHERE user_id = ?', [userId]);

            // 8. Delete the user
            const [result] = await connection.execute('DELETE FROM users WHERE id = ?', [userId]);

            if (result.affectedRows === 0) {
                await connection.rollback();
                return res.status(404).json({ error: 'User not found' });
            }

            await connection.commit();
            res.status(200).json({ message: 'Account deleted successfully' });
        } catch (err) {
            await connection.rollback();
            console.error('Error deleting account:', err);
            res.status(500).json({ error: 'An error occurred during account deletion' });
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



