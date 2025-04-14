const express = require('express');
const router = express.Router();
const adminVerificationController = require('../controllers/adminVerificationController');
const verifyAdmin = require('../middlewares/adminMiddleware');

router.get('/pending', verifyAdmin, adminVerificationController.getPendingVerifications);
router.put('/review/:verificationId', verifyAdmin, adminVerificationController.reviewVerification);

module.exports = router;
