const express = require('express');
const router = express.Router();
const escrowController = require('../controllers/escrowController');
const { verifyToken } = require('../middlewares/authMiddleware');
const { requireVerified } = require('../middlewares/verificationGate');

// All escrow routes require auth + verification
router.post('/orders', verifyToken, requireVerified, escrowController.createOrder);
router.get('/orders', verifyToken, escrowController.getOrders);
router.get('/orders/:id', verifyToken, escrowController.getOrderDetail);
router.put('/orders/:id/confirm', verifyToken, requireVerified, escrowController.confirmDelivery);
router.put('/orders/:id/dispute', verifyToken, requireVerified, escrowController.disputeOrder);
router.put('/orders/:id/resolve', verifyToken, requireVerified, escrowController.resolveDispute);

module.exports = router;
