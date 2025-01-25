// src/routes/userRoutes.js
const express = require('express');
const userController = require('../controllers/userController');
const router = express.Router();

// Landing page for /api
router.get('/', (req, res) => {
  res.status(200).json({ message: 'Welcome to the API! Available routes: /api/users' });
});

// Handle GET request to /api/users
router.get('/users', userController.getUsers);

// Handle POST request to /api/users
router.post('/users', userController.createUser);

router.post('/login', userController.loginUser);

module.exports = router;
