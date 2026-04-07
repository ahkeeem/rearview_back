const express = require('express');
const router = express.Router();
const conversationController = require('../controllers/conversationController');
const { verifyToken } = require('../middlewares/authMiddleware');

router.post('/', verifyToken, conversationController.createConversation);
router.get('/', verifyToken, conversationController.getUserConversations);

module.exports = router;
