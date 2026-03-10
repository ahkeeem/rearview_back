const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const verifyToken = require('../middlewares/authMiddleware');
const { validateRegistration, validateLogin, validateProfileUpdate } = require('../middlewares/validation');
const { authLimiter } = require('../middlewares/rateLimiter');

// Public routes
router.post('/', authLimiter, validateRegistration, userController.createUser);
router.post('/login', authLimiter, validateLogin, userController.loginUser);

// Protected routes - require authentication
router.get('/', verifyToken, userController.getUsers);
router.get('/search', verifyToken, userController.searchUsers);
router.get('/:userId/stats', verifyToken, userController.getUserStats);
router.get('/profile/:id', verifyToken, userController.getUserProfile);
router.put('/profile/:id', verifyToken, validateProfileUpdate, userController.updateProfile);
router.post('/verify', verifyToken, userController.submitVerification);
router.get('/verify/status', verifyToken, userController.getVerificationStatus);


module.exports = router;



