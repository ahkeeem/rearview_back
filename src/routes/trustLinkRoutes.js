const express = require('express');
const router = express.Router();
const trustLinkController = require('../controllers/trustLinkController');
const { verifyToken } = require('../middlewares/authMiddleware');
const { requireVerified } = require('../middlewares/verificationGate');

// Public route (no auth required)
router.get('/public/:slug', trustLinkController.getPublicLink);

// Protected vendor routes (must be verified to create escrow links)
router.post('/', verifyToken, requireVerified, trustLinkController.createLink);
router.get('/', verifyToken, trustLinkController.getMyLinks);
router.put('/:id/toggle', verifyToken, requireVerified, trustLinkController.toggleLinkStatus);

module.exports = router;
