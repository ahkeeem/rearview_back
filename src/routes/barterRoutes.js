const express = require('express');
const { body } = require('express-validator');
const barterController = require('../controllers/barterController');
const { verifyToken } = require('../middlewares/authMiddleware');
const { barterUpload } = require('../controllers/barterController');

const router = express.Router();

/**
 * @route GET /api/barter/browse
 * @desc Browse all available barter items (discovery feed)
 * @access Public
 */
router.get('/browse', barterController.browseItems);

/**
 * @route POST /api/barter/items
 * @desc Add a new barter item with optional photo
 * @access Private
 */
router.post(
  '/items',
  verifyToken,
  barterUpload,
  [
    body('item_name').notEmpty().withMessage('Item name is required'),
    body('want_category').notEmpty().withMessage('What you want in return is required')
  ],
  barterController.addItem
);

/**
 * @route GET /api/barter/loops
 * @desc Fetch active trade loops for the authenticated user
 * @access Private
 */
router.get(
  '/loops',
  verifyToken,
  barterController.getMyLoops
);

/**
 * @route POST /api/barter/loops/:loop_id/sign
 * @desc Signs (commits) to a proposed trade loop
 * @access Private
 */
router.post(
  '/loops/:loop_id/sign',
  verifyToken,
  barterController.signTrade
);

/**
 * @route POST /api/barter/loops/:loop_id/dispute
 * @desc Disputes a trade, triggering the trust penalty logic
 * @access Private
 */
router.post(
  '/loops/:loop_id/dispute',
  verifyToken,
  [
    body('ghosting_user_id').isInt().withMessage('Offending user ID required')
  ],
  barterController.disputeTrade
);

module.exports = router;
