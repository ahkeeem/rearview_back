const express = require('express');
const router = express.Router();
const verificationController = require('../controllers/verificationController');
const verifyToken = require('../middlewares/authMiddleware');

router.post('/submit', verifyToken, verificationController.submitVerification);
router.get('/status/:userId', verifyToken, verificationController.getVerificationStatus);

module.exports = router;
