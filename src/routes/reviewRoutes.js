const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { verifyToken } = require('../middlewares/authMiddleware');
const { validateReview } = require('../middlewares/validation');
const { reviewLimiter } = require('../middlewares/rateLimiter');

// All review routes should be protected
router.post('/', verifyToken, reviewLimiter, validateReview, reviewController.createReview);
router.get('/', verifyToken, reviewController.getAllReviews);
router.get('/received', verifyToken, reviewController.getReceivedReviews);
router.get('/given', verifyToken, reviewController.getGivenReviews);
router.get('/user/:userId', verifyToken, reviewController.getUserReviews);
router.get('/:id', verifyToken, reviewController.getReviewById);

// Update Review
router.put('/:id', verifyToken, reviewController.updateReview);

// Delete Review
router.delete('/:id', verifyToken, reviewController.deleteReview);

// Trust Mechanisms
router.post('/:id/dispute', verifyToken, reviewController.disputeReview);
router.put('/:id/resolve', verifyToken, reviewController.resolveDispute);

module.exports = router;
