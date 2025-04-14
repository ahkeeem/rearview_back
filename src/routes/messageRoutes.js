const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/authMiddleware');
const messageController = require('../controllers/messageController');

router.post('/', verifyToken, messageController.createMessage);
router.get('/conversation/:conversationId', verifyToken, messageController.getMessagesByConversation);

module.exports = router;