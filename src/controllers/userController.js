const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const multer = require('multer');
const path = require('path');
const emailService = require('../services/emailService');
const smsService = require('../services/smsService');

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

    // Get all users — safe fields only, never expose password or sensitive flags
    getUsers: async (req, res) => {
        try {
            const [rows] = await pool.execute(
                `SELECT id, name, email, photo_url, headline, location,
                        trust_score, verification_level, role, created_at
                 FROM users
                 WHERE status = 'active'
                 ORDER BY created_at DESC
                 LIMIT 100`
            );
            res.status(200).json(rows);
        } catch (err) {
            console.error('Error fetching users:', err.message);
            res.status(500).json({ error: 'An error occurred while fetching users.' });
        }
    },

    // Create a new user
    createUser: async (req, res) => {
        try {
            const { name, email, password, phone } = req.body;

            // Validate required fields — phone is optional at signup
            if (!name || !email || !password) {
                return res.status(400).json({ error: 'Name, email, and password are required.' });
            }

            // Hash the password before saving it
            const hashedPassword = await bcrypt.hash(password, 10);

            // SQL query - phone is optional
            const query = phone
                ? 'INSERT INTO users (name, email, password, phone) VALUES (?, ?, ?, ?)'
                : 'INSERT INTO users (name, email, password) VALUES (?, ?, ?)';
            const params = phone ? [name, email, hashedPassword, phone] : [name, email, hashedPassword];
            const [result] = await pool.execute(query, params);

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

            return res.status(500).json({ error: 'User creation failed' });
        } catch (error) {
            console.error('User creation error:', error);

            if (error.code === 'ER_DUP_ENTRY') {
                if (error.sqlMessage && error.sqlMessage.includes('email')) {
                    return res.status(409).json({ error: 'Email already exists. Please use a different email.' });
                }
                if (error.sqlMessage && error.sqlMessage.includes('phone')) {
                    return res.status(409).json({ error: 'Phone number is already associated with another account.' });
                }
                return res.status(409).json({ error: 'An account with these details already exists.' });
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
            
            // 1. Audit login attempt
            await pool.execute(
                'INSERT INTO login_attempts (ip_address, email) VALUES (?, ?)',
                [req.ip, email]
            );

            const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
            if (rows.length === 0) {
                return res.status(401).json({ error: 'Identity not recognized' });
            }

            const user = rows[0];
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(401).json({ error: 'Identity not recognized' });
            }

            // 2. Generate 6-digit OTP
            const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

            await pool.execute(
                'INSERT INTO otp_codes (user_id, code, type, expires_at) VALUES (?, ?, "login", ?)',
                [user.id, otpCode, expiresAt]
            );

            // REAL OTP DELIVERY
            await emailService.sendOTP(user.email, user.name, otpCode, 'login');

            res.status(200).json({
                message: 'Verification code sent',
                pending_verification: true,
                email: user.email,
                userId: user.id,
                // DEV ONLY: include code so it's visible on-screen
                ...(process.env.NODE_ENV !== 'production' && { dev_otp: otpCode })
            });
        } catch (err) {
            console.error('Error during login [detailed]:', err);
            res.status(500).json({ error: 'Security subsystem failure', details: err.sqlMessage || err.message });
        }
    },

    confirmOTP: async (req, res) => {
        try {
            const { userId, code } = req.body;
            
            if (!userId || !code) {
                return res.status(400).json({ error: 'Incomplete verification payload' });
            }

            const [rows] = await pool.execute(
                'SELECT * FROM otp_codes WHERE user_id = ? AND code = ? AND type = "login" AND expires_at > ? ORDER BY created_at DESC LIMIT 1',
                [userId, code, new Date()]
            );

            if (rows.length === 0) {
                return res.status(401).json({ error: 'Invalid or expired verification code' });
            }

            // Code is valid, fetch full user to issue token
            const [userRows] = await pool.execute('SELECT * FROM users WHERE id = ?', [userId]);
            const user = userRows[0];

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
                [user.id, 'LOGIN_VERIFIED', req.ip]
            );

            // Cleanup code
            await pool.execute('DELETE FROM otp_codes WHERE id = ?', [rows[0].id]);

            res.status(200).json({
                message: 'Verification successful',
                token,
                user: { id: user.id, name: user.name, email: user.email }
            });
        } catch (err) {
            console.error('OTP confirmation error:', err.message);
            res.status(500).json({ error: 'Verification subsystem failure' });
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
                'SELECT id, name, email, bio, headline, location, photo_url, banner_url, phone, website, entity_id, status, verification_level, nin_verified, bvn_verified, email_verified, phone_verified FROM users WHERE id = ?',
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
            const requestingUser = req.user.userId || req.user.id;

            // ── Ownership check: users can only update their own profile ─────
            if (parseInt(id) !== parseInt(requestingUser)) {
                return res.status(403).json({ error: 'You can only update your own profile.' });
            }

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
            const deletionDate = new Date();
            deletionDate.setDate(deletionDate.getDate() + 30);
            
            const [result] = await connection.execute(
                "UPDATE users SET status = 'pending_deletion', deletion_scheduled_at = ?, email = CONCAT(id, '_deleted@local'), photo_url = NULL WHERE id = ?",
                [deletionDate, userId]
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
    },

    // Forgot Password — send reset OTP
    forgotPassword: async (req, res) => {
        try {
            const { email } = req.body;
            if (!email) return res.status(400).json({ error: 'Email is required' });

            const [users] = await pool.execute('SELECT id, name FROM users WHERE email = ?', [email]);
            if (users.length === 0) {
                return res.json({ message: 'If an account exists with that email, a reset code has been sent.' });
            }

            const user = users[0];
            const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

            await pool.execute(
                'INSERT INTO otp_codes (user_id, code, type, expires_at) VALUES (?, ?, "verify", ?)',
                [user.id, otpCode, expiresAt]
            );

            await emailService.sendOTP(email, user.name, otpCode, 'password_reset');

            res.json({ message: 'If an account exists with that email, a reset code has been sent.' });
        } catch (err) {
            console.error('Forgot password error:', err);
            res.status(500).json({ error: 'Failed to process request' });
        }
    },

    // Reset Password — verify OTP and set new password
    resetPassword: async (req, res) => {
        try {
            const { email, code, newPassword } = req.body;
            if (!email || !code || !newPassword) {
                return res.status(400).json({ error: 'Email, code, and new password are required' });
            }

            const [users] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
            if (users.length === 0) {
                return res.status(400).json({ error: 'Invalid reset request' });
            }

            const userId = users[0].id;
            const [codes] = await pool.execute(
                'SELECT * FROM otp_codes WHERE user_id = ? AND code = ? AND type = "verify" AND expires_at > ? ORDER BY created_at DESC LIMIT 1',
                [userId, code, new Date()]
            );

            if (codes.length === 0) {
                return res.status(401).json({ error: 'Invalid or expired reset code' });
            }

            const hashedPassword = await bcrypt.hash(newPassword, 10);
            await pool.execute('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);
            await pool.execute('DELETE FROM otp_codes WHERE id = ?', [codes[0].id]);
            await pool.execute('DELETE FROM user_sessions WHERE user_id = ?', [userId]);

            res.json({ message: 'Password reset successful. Please login with your new password.' });
        } catch (err) {
            console.error('Reset password error:', err);
            res.status(500).json({ error: 'Failed to reset password' });
        }
    },

    // POST /logout 
    logoutUser: async (req, res) => {
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

    // Email verification — send OTP
    sendEmailVerification: async (req, res) => {
        try {
            const userId = req.user.userId || req.user.id;
            const [users] = await pool.execute('SELECT email, name FROM users WHERE id = ?', [userId]);
            if (users.length === 0) return res.status(404).json({ error: 'User not found' });

            const user = users[0];
            const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

            await pool.execute(
                'INSERT INTO otp_codes (user_id, code, type, expires_at) VALUES (?, ?, "verify", ?)',
                [userId, otpCode, expiresAt]
            );

            await emailService.sendOTP(user.email, user.name, otpCode, 'verify');

            res.json({ message: 'Verification code sent to your email.' });
        } catch (err) {
            console.error('Send email verification error:', err);
            res.status(500).json({ error: 'Failed to send verification' });
        }
    },

    // Email verification — confirm
    confirmEmailVerification: async (req, res) => {
        try {
            const userId = req.user.userId || req.user.id;
            const { code } = req.body;

            const [codes] = await pool.execute(
                'SELECT * FROM otp_codes WHERE user_id = ? AND code = ? AND type = "verify" AND expires_at > ? ORDER BY created_at DESC LIMIT 1',
                [userId, code, new Date()]
            );

            if (codes.length === 0) {
                return res.status(401).json({ error: 'Invalid or expired code' });
            }

            await pool.execute(
                "UPDATE users SET email_verified = TRUE, verification_level = CASE WHEN verification_level = 'none' THEN 'phone' ELSE verification_level END WHERE id = ?",
                [userId]
            );
            await pool.execute('DELETE FROM otp_codes WHERE id = ?', [codes[0].id]);

            res.json({ message: 'Email verified successfully!' });
        } catch (err) {
            console.error('Confirm email verification error:', err);
            res.status(500).json({ error: 'Verification failed' });
        }
    },

    // Phone verification — send OTP
    sendPhoneVerification: async (req, res) => {
        try {
            const userId = req.user.userId || req.user.id;
            const { phone } = req.body;
            if (!phone) return res.status(400).json({ error: 'Phone number is required' });

            const [existing] = await pool.execute('SELECT id FROM users WHERE phone = ? AND id != ?', [phone, userId]);
            if (existing.length > 0) {
                return res.status(409).json({ error: 'This phone number is already linked to another account.' });
            }

            await pool.execute('UPDATE users SET phone = ? WHERE id = ?', [phone, userId]);

            const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

            await pool.execute(
                'INSERT INTO otp_codes (user_id, code, type, expires_at) VALUES (?, ?, "verify", ?)',
                [userId, otpCode, expiresAt]
            );

            await smsService.sendOTP(phone, otpCode);

            res.json({ message: 'Verification code sent to your phone.' });
        } catch (err) {
            console.error('Send phone verification error:', err);
            res.status(500).json({ error: 'Failed to send verification' });
        }
    },

    // Phone verification — confirm
    confirmPhoneVerification: async (req, res) => {
        try {
            const userId = req.user.userId || req.user.id;
            const { code } = req.body;

            const [codes] = await pool.execute(
                'SELECT * FROM otp_codes WHERE user_id = ? AND code = ? AND type = "verify" AND expires_at > ? ORDER BY created_at DESC LIMIT 1',
                [userId, code, new Date()]
            );

            if (codes.length === 0) {
                return res.status(401).json({ error: 'Invalid or expired code' });
            }

            await pool.execute(
                "UPDATE users SET phone_verified = TRUE, verification_level = 'phone' WHERE id = ?",
                [userId]
            );
            await pool.execute('DELETE FROM otp_codes WHERE id = ?', [codes[0].id]);

            res.json({ message: 'Phone verified successfully!' });
        } catch (err) {
            console.error('Confirm phone verification error:', err);
            res.status(500).json({ error: 'Verification failed' });
        }
    }
};

module.exports = userController;
