const pool = require('../config/database'); // Assuming you're using the same database connection
const reviewController = {
    // Create Review
    createReview: async (req, res) => {
        try {
            const { reviewee_id, rating, comment } = req.body;
            const reviewer_id = req.user.userId || req.user.id;

            // Validate input
            if (!reviewee_id || !rating) {
                return res.status(400).json({ error: 'Reviewee ID and rating are required.' });
            }
            if (rating < 1 || rating > 5) {
                return res.status(400).json({ error: 'Rating must be between 1 and 5.' });
            }
            if (reviewer_id === reviewee_id) {
                return res.status(400).json({ error: 'Cannot review yourself.' });
            }

            const query = 'INSERT INTO reviews (reviewer_id, reviewee_id, rating, comment) VALUES (?, ?, ?, ?)';
            const [result] = await pool.execute(query, [reviewer_id, reviewee_id, rating, comment || null]);

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
            const query = 'SELECT * FROM reviews WHERE reviewee_id = ?';
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
                `SELECT r.*, u.name as reviewer_name 
                 FROM reviews r 
                 JOIN users u ON r.reviewer_id = u.id 
                 WHERE r.reviewee_id = ?
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
                `SELECT r.*, u.name as reviewer_name, u.email as reviewer_email
                 FROM reviews r 
                 JOIN users u ON r.reviewer_id = u.id 
                 WHERE r.reviewee_id = ?
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
                 JOIN users u ON r.reviewee_id = u.id 
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
    }
};

module.exports = reviewController;
