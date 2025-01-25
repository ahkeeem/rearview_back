const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');

// Create Review
router.post('/', reviewController.createReview);

// Get All Reviews
router.get('/', reviewController.getAllReviews);

// Get Review by ID
router.get('/:id', reviewController.getReviewById);

// Get Reviews for a specific user
router.get('/user/:userId', reviewController.getReviewsByUserId);

// Update Review
router.put('/:id', reviewController.updateReview);

// Delete Review
router.delete('/:id', reviewController.deleteReview);

module.exports = router;
