const express = require('express');
const router = express.Router();
const threadController = require('../controllers/threadController');
const { verifyToken } = require('../middlewares/authMiddleware');

// Entity threads collection routes
router.get('/entity/:entityId', verifyToken, threadController.getThreadsByEntity);
router.post('/', verifyToken, threadController.createThread);

// Internal conversation string manipulation routes
router.get('/:threadId', verifyToken, threadController.getComments);
router.post('/:threadId/comments', verifyToken, threadController.addComment);

module.exports = router;
