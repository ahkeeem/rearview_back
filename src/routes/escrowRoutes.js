const express = require('express');
const router = express.Router();
const escrowController = require('../controllers/escrowController');
const { verifyToken } = require('../middlewares/authMiddleware');
const { requireVerified } = require('../middlewares/verificationGate');
const verifyAdmin = require('../middlewares/adminMiddleware');

// Public route for Trust Links checkout
router.post('/pay-link/:slug', escrowController.payTrustLink);

// All other escrow routes require auth + verification
router.post('/orders', verifyToken, requireVerified, escrowController.createOrder);
router.get('/orders', verifyToken, escrowController.getOrders);
router.get('/orders/:id', verifyToken, escrowController.getOrderDetail);
router.put('/orders/:id/confirm', verifyToken, requireVerified, escrowController.confirmDelivery);
router.put('/orders/:id/deliver', verifyToken, requireVerified, escrowController.markDelivered);
router.put('/orders/:id/dispute', verifyToken, requireVerified, escrowController.disputeOrder);
router.get('/orders/:id/messages', verifyToken, requireVerified, escrowController.getDisputeMessages);
router.post('/orders/:id/messages', verifyToken, requireVerified, escrowController.addDisputeMessage);
router.put('/orders/:id/resolve', verifyToken, verifyAdmin, escrowController.resolveDispute);

module.exports = router;
