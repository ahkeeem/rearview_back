const express = require('express');
const router = express.Router();
const connectionController = require('../controllers/connectionController');
const verifyToken = require('../middlewares/authMiddleware');

// Define routes
router.post('/', verifyToken, connectionController.createConnection);
router.get('/', verifyToken, connectionController.getConnections);
router.put('/:id/status', verifyToken, connectionController.updateConnectionStatus);

module.exports = router;