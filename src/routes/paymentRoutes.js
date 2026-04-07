const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { verifyToken } = require('../middlewares/authMiddleware');
const { requireVerified } = require('../middlewares/verificationGate');

// Protected routes — all require auth + verification
router.get('/wallet', verifyToken, paymentController.getWallet);
router.get('/transactions', verifyToken, paymentController.getTransactions);
router.post('/initialize', verifyToken, requireVerified, paymentController.initializePayment);
router.post('/topup', verifyToken, requireVerified, paymentController.initiateTopUp);
router.get('/verify/:reference', verifyToken, paymentController.verifyPayment);
router.get('/banks', verifyToken, paymentController.getBankList);
router.post('/verify-account', verifyToken, requireVerified, paymentController.verifyAccount);
router.post('/payout', verifyToken, requireVerified, paymentController.requestPayout);

// Webhook — no auth (Paystack calls this)
router.post('/webhook', paymentController.handleWebhook);

module.exports = router;
