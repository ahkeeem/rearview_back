const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const verifyToken = require('../middlewares/authMiddleware');

// Public routes
router.post('/', userController.createUser);
router.post('/login', userController.loginUser);

// Protected routes - require authentication
router.get('/', verifyToken, userController.getUsers);
router.get('/search', verifyToken, userController.searchUsers);
router.get('/:userId/stats', verifyToken, userController.getUserStats);
router.get('/:userId/stats', verifyToken, userController.getUserStats);
router.get('/profile/:id', verifyToken, userController.getUserProfile);
router.put('/profile/:id', verifyToken, userController.updateProfile);
router.post('/verify', verifyToken, userController.submitVerification)
router.get('/verify/status', verifyToken, userController.getVerificationStatus)


module.exports = router;



