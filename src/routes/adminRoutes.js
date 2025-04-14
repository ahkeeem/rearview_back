const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const verifyAdmin = require('../middlewares/adminMiddleware');

// Verify the controller methods exist
router.get('/verifications/pending', verifyAdmin, userController.getPendingVerifications);
router.put('/verifications/:verificationId', verifyAdmin, userController.reviewVerification);

module.exports = router;