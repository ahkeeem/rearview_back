const pool = require('../config/database'); // Assuming you're using the same database connection
const reviewController = {
    // Create Review
    createReview: async (req, res) => {
        try {
            const { 
                reviewee_id, 
                target_entity_id: provided_entity_id, 
                rating, 
                comment,
                interaction_type,
                proof_url 
            } = req.body;
            const reviewer_id = req.user.userId || req.user.id;

            // Validate input
            if (!reviewee_id && !provided_entity_id) {
                return res.status(400).json({ error: 'A target entity or reviewee ID is required.' });
            }
            if (!rating) {
                return res.status(400).json({ error: 'Rating is required.' });
            }
            if (rating < 1 || rating > 5) {
                return res.status(400).json({ error: 'Rating must be between 1 and 5.' });
            }
            if (reviewee_id && reviewer_id === parseInt(reviewee_id, 10)) {
                return res.status(400).json({ error: 'Cannot review yourself.' });
            }

            let target_entity_id = provided_entity_id;

            // Fallback for legacy flows generating User targeted reviews
            if (!target_entity_id && reviewee_id) {
                const [users] = await pool.execute('SELECT entity_id FROM users WHERE id = ?', [reviewee_id]);
                if (users.length === 0 || !users[0].entity_id) {
                     return res.status(404).json({ error: 'Target user entity not found.' });
                }
                target_entity_id = users[0].entity_id;
            }

            // Anti-Abuse: Check for existing review in last 24h
            const [recentReviews] = await pool.execute(
                'SELECT id FROM reviews WHERE reviewer_id = ? AND target_entity_id = ? AND created_at > (NOW() - INTERVAL 1 DAY)',
                [reviewer_id, target_entity_id]
            );

            if (recentReviews.length > 0) {
                return res.status(429).json({ error: 'You have already reviewed this entity in the last 24 hours.' });
            }

            const query = 'INSERT INTO reviews (reviewer_id, target_entity_id, rating, comment, interaction_type, proof_url) VALUES (?, ?, ?, ?, ?, ?)';
            const [result] = await pool.execute(query, [
                reviewer_id, 
                target_entity_id, 
                rating, 
                comment || null,
                interaction_type || 'general',
                proof_url || null
            ]);

            // [Hook] Dispatch to Activity Feed
            await pool.execute(
                "INSERT INTO activity_feed (actor_id, action_type, target_id, target_entity_id, action_data) VALUES (?, 'wrote_review', ?, ?, ?)",
                [reviewer_id, result.insertId, target_entity_id, JSON.stringify({ rating })]
            );

            res.status(201).json({
                message: 'Review created successfully',
                reviewId: result.insertId
            });
        } catch (err) {
            console.error('Error creating review:', err.message);
            res.status(500).json({ error: 'An error occurred while creating the review.' });
        }
    },

    // Get All Reviews
    getAllReviews: async (req, res) => {
        try {
            const query = 'SELECT * FROM reviews';
            const [reviews] = await pool.execute(query);
            res.status(200).json(reviews);
        } catch (err) {
            console.error('Error fetching reviews:', err.message);
            res.status(500).json({ error: 'An error occurred while fetching reviews.' });
        }
    },

    // Get Review by ID
    getReviewById: async (req, res) => {
        try {
            const { id } = req.params;
            const query = 'SELECT * FROM reviews WHERE id = ?';
            const [review] = await pool.execute(query, [id]);

            if (review.length === 0) {
                return res.status(404).json({ error: 'Review not found.' });
            }

            res.status(200).json(review[0]);
        } catch (err) {
            console.error('Error fetching review:', err.message);
            res.status(500).json({ error: 'An error occurred while fetching the review.' });
        }
    },

    // Get Reviews by User ID
    getReviewsByUserId: async (req, res) => {
        try {
            const { userId } = req.params;
            const query = 'SELECT * FROM reviews r INNER JOIN users u ON u.entity_id = r.target_entity_id WHERE u.id = ?';
            const [reviews] = await pool.execute(query, [userId]);

            res.status(200).json(reviews);
        } catch (err) {
            console.error('Error fetching reviews for user:', err.message);
            res.status(500).json({ error: 'An error occurred while fetching reviews for this user.' });
        }
    },


    getUserReviews: async (req, res) => {
        try {
            const userId = req.params.userId;
            const [reviews] = await pool.execute(
                `SELECT r.*, u.name as reviewer_name, e.claimed_by_user_id
                 FROM reviews r 
                 JOIN users u ON r.reviewer_id = u.id 
                 JOIN entities e ON r.target_entity_id = e.id
                 JOIN users tgt ON r.target_entity_id = tgt.entity_id
                 WHERE tgt.id = ?
                 ORDER BY r.created_at DESC`,
                [userId]
            );
            res.json(reviews);
        } catch (err) {
            console.error('Error fetching reviews:', err);
            res.status(500).json({ error: 'Failed to fetch reviews' });
        }
    },

    // Get reviews received by the authenticated user
    getReceivedReviews: async (req, res) => {
        try {
            const userId = req.user.userId || req.user.id;
            const [reviews] = await pool.execute(
                `SELECT r.*, u.name as reviewer_name, e.claimed_by_user_id
                 FROM reviews r 
                 JOIN users u ON r.reviewer_id = u.id 
                 JOIN entities e ON r.target_entity_id = e.id
                 JOIN users tgt ON r.target_entity_id = tgt.entity_id
                 WHERE tgt.id = ?
                 ORDER BY r.created_at DESC`,
                [userId]
            );
            res.json(reviews);
        } catch (err) {
            console.error('Error fetching received reviews:', err);
            res.status(500).json({ error: 'Failed to fetch received reviews' });
        }
    },

    // Get reviews given by the authenticated user
    getGivenReviews: async (req, res) => {
        try {
            const userId = req.user.userId || req.user.id;
            const [reviews] = await pool.execute(
                `SELECT r.*, u.name as reviewee_name, u.email as reviewee_email
                 FROM reviews r 
                 JOIN users u ON r.target_entity_id = u.entity_id 
                 WHERE r.reviewer_id = ?
                 ORDER BY r.created_at DESC`,
                [userId]
            );
            res.json(reviews);
        } catch (err) {
            console.error('Error fetching given reviews:', err);
            res.status(500).json({ error: 'Failed to fetch given reviews' });
        }
    },

    // Update Review
    updateReview: async (req, res) => {
        try {
            const { id } = req.params;
            const { rating, comment } = req.body;

            if (!rating || rating < 1 || rating > 5) {
                return res.status(400).json({ error: 'Rating must be between 1 and 5.' });
            }

            const query = 'UPDATE reviews SET rating = ?, comment = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
            const [result] = await pool.execute(query, [rating, comment, id]);

            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Review not found or cannot be updated.' });
            }

            res.status(200).json({ message: 'Review updated successfully' });
        } catch (err) {
            console.error('Error updating review:', err.message);
            res.status(500).json({ error: 'An error occurred while updating the review.' });
        }
    },

    // Delete Review
    deleteReview: async (req, res) => {
        try {
            const { id } = req.params;
            const query = 'DELETE FROM reviews WHERE id = ?';
            const [result] = await pool.execute(query, [id]);

            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Review not found or cannot be deleted.' });
            }

            res.status(200).json({ message: 'Review deleted successfully' });
        } catch (err) {
            console.error('Error deleting review:', err.message);
            res.status(500).json({ error: 'An error occurred while deleting the review.' });
        }
    },

    // Trust Mechanism: Dispute Review
    disputeReview: async (req, res) => {
        try {
            const { id } = req.params;
            const { reason } = req.body;
            const userId = req.user.userId || req.user.id;

            // 1. Verify Review exists and its rating is kontestable (<= 2)
            const [reviews] = await pool.execute(
                'SELECT r.*, e.claimed_by_user_id FROM reviews r JOIN entities e ON r.target_entity_id = e.id WHERE r.id = ?',
                [id]
            );

            if (reviews.length === 0) {
                return res.status(404).json({ error: 'Review not found.' });
            }

            const review = reviews[0];

            if (review.rating > 2) {
                return res.status(400).json({ error: 'Only reviews with 2 stars or below can be disputed.' });
            }

            // 2. Verify Ownership (Must be the claimed owner of the entity)
            if (review.claimed_by_user_id !== userId) {
                return res.status(403).json({ error: 'Only the claimed owner of this entity can dispute this review.' });
            }

            // 3. Mark as Disputed
            await pool.execute(
                'UPDATE reviews SET is_disputed = 1, dispute_reason = ? WHERE id = ?',
                [reason || 'No proof of interaction provided', id]
            );

            // [Hook] Update activity feed with Dispute event
            await pool.execute(
                "INSERT INTO activity_feed (actor_id, action_type, target_id, target_entity_id, action_data) VALUES (?, 'disputed_review', ?, ?, ?)",
                [userId, id, review.target_entity_id, JSON.stringify({ reason: reason || 'Merchant contested interaction' })]
            );

            res.status(200).json({ message: 'Review disputed successfully. Its weight has been penalized.' });
        } catch (err) {
            console.error('Error disputing review:', err);
            res.status(500).json({ error: 'Failed to dispute review' });
        }
    },

    // Trust Mechanism: Add Merchant Response
    addReviewResponse: async (req, res) => {
        try {
            const { id } = req.params;
            const { content } = req.body;
            const userId = req.user.userId || req.user.id;

            if (!content) return res.status(400).json({ error: 'Response content is required.' });

            // 1. Verify Ownership of the target entity
            const [reviews] = await pool.execute(
                'SELECT r.*, e.claimed_by_user_id FROM reviews r JOIN entities e ON r.target_entity_id = e.id WHERE r.id = ?',
                [id]
            );

            if (reviews.length === 0) return res.status(404).json({ error: 'Review not found.' });
            
            const review = reviews[0];
            if (review.claimed_by_user_id !== userId) {
                return res.status(403).json({ error: 'Only the entity owner can officially respond to this review.' });
            }

            // 2. Insert Response
            const [result] = await pool.execute(
                'INSERT INTO review_responses (review_id, responder_id, content) VALUES (?, ?, ?)',
                [id, userId, content]
            );

            res.status(201).json({
                message: 'Response added successfully',
                responseId: result.insertId
            });
        } catch (err) {
            console.error('Error adding review response:', err);
            res.status(500).json({ error: 'Failed to add response' });
        }
    },

    // Trust Mechanism: Resolve Dispute (By providing proof)
    resolveDispute: async (req, res) => {
        try {
            const { id } = req.params;
            const { proof_url } = req.body;
            const userId = req.user.userId || req.user.id;

            const [reviews] = await pool.execute('SELECT * FROM reviews WHERE id = ?', [id]);
            if (reviews.length === 0) return res.status(404).json({ error: 'Review not found' });

            const review = reviews[0];

            // Only the original reviewer can resolve the dispute by providing proof
            if (review.reviewer_id !== userId) {
                return res.status(403).json({ error: 'Only the original reviewer can resolve this dispute with proof.' });
            }

            if (!proof_url) {
                return res.status(400).json({ error: 'Verifiable proof (URL) is required to resolve a dispute.' });
            }

            await pool.execute(
                'UPDATE reviews SET is_disputed = 0, proof_url = ? WHERE id = ?',
                [proof_url, id]
            );

            res.status(200).json({ message: 'Dispute resolved successfully. Review weight restored.' });
        } catch (err) {
            console.error('Error resolving dispute:', err);
            res.status(500).json({ error: 'Failed to resolve dispute' });
        }
    }
};

module.exports = reviewController;
