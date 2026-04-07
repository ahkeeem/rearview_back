const express = require('express');
const router = express.Router();
const trustController = require('../controllers/trustController');
const { verifyToken } = require('../middlewares/authMiddleware');

router.get('/score/:userId', verifyToken, trustController.calculateTrustScore);

module.exports = router;
