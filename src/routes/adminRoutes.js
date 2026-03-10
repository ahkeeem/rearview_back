const express = require('express');
const router = express.Router();
const adminVerificationController = require('../controllers/adminVerificationController');
const verifyAdmin = require('../middlewares/adminMiddleware');

// Admin verification routes
router.get('/verifications/pending', verifyAdmin, adminVerificationController.getPendingVerifications);
router.put('/verifications/:verificationId', verifyAdmin, adminVerificationController.reviewVerification);

module.exports = router;