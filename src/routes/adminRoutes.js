const express = require('express');
const router = express.Router();
const adminVerificationController = require('../controllers/adminVerificationController');
const escrowController = require('../controllers/escrowController');
const adminController = require('../controllers/adminController');
const verifyAdmin = require('../middlewares/adminMiddleware');

// Admin verification routes
router.get('/verifications/pending', verifyAdmin, adminVerificationController.getPendingVerifications);
router.put('/verifications/:verificationId', verifyAdmin, adminVerificationController.reviewVerification);

// Admin escrow dispute routes
router.get('/disputes', verifyAdmin, adminController.getDisputes);

router.put('/disputes/:id/resolve', verifyAdmin, escrowController.resolveDispute);
router.get('/disputes/:id/messages', verifyAdmin, escrowController.getDisputeMessages);
router.post('/disputes/:id/messages', verifyAdmin, escrowController.addDisputeMessage);

router.get('/escrow/all', verifyAdmin, adminController.getAllEscrowOrders);

module.exports = router;