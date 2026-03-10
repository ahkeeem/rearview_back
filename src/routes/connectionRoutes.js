const express = require('express');
const router = express.Router();
const connectionController = require('../controllers/connectionController');
const verifyToken = require('../middlewares/authMiddleware');
const { validateConnection } = require('../middlewares/validation');

// Define routes
router.post('/', verifyToken, validateConnection, connectionController.createConnection);
router.get('/', verifyToken, connectionController.getConnections);
router.put('/:id/status', verifyToken, connectionController.updateConnectionStatus);

module.exports = router;