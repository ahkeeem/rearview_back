const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const verifyToken = require('../middlewares/authMiddleware');
const verifyAdmin = require('../middlewares/adminMiddleware');

router.post('/', verifyToken, reportController.createReport);
router.get('/', verifyAdmin, reportController.getReports);
router.put('/:id/status', verifyAdmin, reportController.updateReportStatus);
router.get('/user/:userId', verifyAdmin, reportController.getReportsByUser);

module.exports = router;


