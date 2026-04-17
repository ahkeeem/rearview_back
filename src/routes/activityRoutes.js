const express = require('express');
const router = express.Router();
const activityController = require('../controllers/activityController');
const { verifyToken } = require('../middlewares/authMiddleware');

// Get generic activity feed parsing connections and targeting logic
router.get('/', verifyToken, activityController.getFeed);
router.get('/warnings', verifyToken, activityController.getWarnings);
router.get('/notifications', verifyToken, activityController.getNotifications);

module.exports = router;
