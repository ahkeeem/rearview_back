const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken } = require('../middlewares/authMiddleware');
const { validateRegistration, validateLogin, validateProfileUpdate } = require('../middlewares/validation');
const { authLimiter } = require('../middlewares/rateLimiter');

// Public routes
router.post('/', authLimiter, validateRegistration, userController.createUser);
router.post('/login', authLimiter, validateLogin, userController.loginUser);
router.post('/login/confirm', authLimiter, userController.confirmOTP);
router.post('/forgot-password', authLimiter, userController.forgotPassword);
router.post('/reset-password', authLimiter, userController.resetPassword);

// Protected routes - require authentication
router.post('/logout', verifyToken, userController.logoutUser);
router.get('/', verifyToken, userController.getUsers);
router.get('/search', verifyToken, userController.searchUsers);
router.get('/:userId/stats', verifyToken, userController.getUserStats);
router.get('/profile/:id', verifyToken, userController.getUserProfile);
router.put('/profile/:id', verifyToken, validateProfileUpdate, userController.updateProfile);
router.post('/upload-image', verifyToken, userController.uploadImage);
router.delete('/profile/:id', verifyToken, userController.deleteAccount);
router.put('/2fa', verifyToken, userController.toggle2FA);
router.post('/verify', verifyToken, userController.submitVerification);
router.get('/verify/status', verifyToken, userController.getVerificationStatus);

// Verification routes
router.post('/verify/send-email', verifyToken, userController.sendEmailVerification);
router.post('/verify/confirm-email', verifyToken, userController.confirmEmailVerification);
router.post('/verify/send-phone', verifyToken, userController.sendPhoneVerification);
router.post('/verify/confirm-phone', verifyToken, userController.confirmPhoneVerification);

module.exports = router;
