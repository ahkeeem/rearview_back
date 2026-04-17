const express = require('express');
const router = express.Router();
const conversationController = require('../controllers/conversationController');
const { verifyToken } = require('../middlewares/authMiddleware');

router.post('/', verifyToken, conversationController.createConversation);
router.get('/', verifyToken, conversationController.getUserConversations);
router.put('/:id/read', verifyToken, conversationController.markAsRead);

module.exports = router;
