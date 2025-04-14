const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const verifyToken = require('../middlewares/authMiddleware');

// All review routes should be protected
router.post('/', verifyToken, reviewController.createReview);
router.get('/', verifyToken, reviewController.getAllReviews);
router.get('/:id', verifyToken, reviewController.getReviewById);
// Get Reviews for a specific user
router.get('/user/:userId', reviewController.getReviewsByUserId);

// Update Review
router.put('/:id', verifyToken, reviewController.updateReview);

// Delete Review
router.delete('/:id', verifyToken, reviewController.deleteReview);

router.post('/', verifyToken, reviewController.createReview);
router.get('/user/:userId', verifyToken, reviewController.getUserReviews);

module.exports = router;
