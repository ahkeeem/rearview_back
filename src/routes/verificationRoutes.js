const express = require('express');
const router = express.Router();
const verificationController = require('../controllers/verificationController');
const { verifyToken } = require('../middlewares/authMiddleware');

// NIN/BVN Identity Verification
router.post('/nin', verifyToken, verificationController.verifyNIN);
router.post('/bvn', verifyToken, verificationController.verifyBVN);

module.exports = router;
