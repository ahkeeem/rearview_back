const express = require('express');
const router = express.Router();
const entityController = require('../controllers/entityController');
const { verifyToken, optionalVerify } = require('../middlewares/authMiddleware');

router.get('/search', optionalVerify, entityController.searchEntities);
router.get('/suggestions', verifyToken, entityController.getSuggestions);
router.post('/register', verifyToken, entityController.createEntity);

module.exports = router;
