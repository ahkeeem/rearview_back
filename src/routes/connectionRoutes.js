const express = require('express');
const router = express.Router();
const connectionController = require('../controllers/connectionController');
const { verifyToken } = require('../middlewares/authMiddleware');
const { requireVerified } = require('../middlewares/verificationGate');
const { validateConnection } = require('../middlewares/validation');

// Write — require verified
router.post('/', verifyToken, requireVerified, validateConnection, connectionController.createConnection);
// Read
router.get('/', verifyToken, connectionController.getConnections);
// Update
router.put('/:id/status', verifyToken, requireVerified, connectionController.updateConnectionStatus);
// Delete (Cancel / Unfriend)
router.delete('/:id', verifyToken, requireVerified, connectionController.deleteConnection);

module.exports = router;