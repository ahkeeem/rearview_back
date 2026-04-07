const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/reviewController');
const { verifyToken } = require('../middlewares/authMiddleware');
const { requireVerified } = require('../middlewares/verificationGate');
const { validateReview } = require('../middlewares/validation');
const { reviewLimiter } = require('../middlewares/rateLimiter');

// Write operations — require verified account
router.post('/', verifyToken, requireVerified, reviewLimiter, validateReview, reviewController.createReview);

// Read operations — any authenticated user
router.get('/', verifyToken, reviewController.getAllReviews);
router.get('/received', verifyToken, reviewController.getReceivedReviews);
router.get('/given', verifyToken, reviewController.getGivenReviews);
router.get('/user/:userId', verifyToken, reviewController.getUserReviews);
router.get('/:id', verifyToken, reviewController.getReviewById);

// Update/Delete — require verified
router.put('/:id', verifyToken, requireVerified, reviewController.updateReview);
router.delete('/:id', verifyToken, requireVerified, reviewController.deleteReview);

// Trust Mechanisms — require verified
router.post('/:id/dispute', verifyToken, requireVerified, reviewController.disputeReview);
router.put('/:id/resolve', verifyToken, requireVerified, reviewController.resolveDispute);

module.exports = router;
