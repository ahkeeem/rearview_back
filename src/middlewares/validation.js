const validator = require('validator');
const { body, validationResult } = require('express-validator');

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// User registration validation
const validateRegistration = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Name can only contain letters and spaces'),
  
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  
  validate
];

// User login validation
const validateLogin = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  
  validate
];

// Review validation
const validateReview = [
  body('reviewee_id')
    .isInt({ min: 1 })
    .withMessage('Valid reviewee ID is required'),
  
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  
  body('comment')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Comment must not exceed 2000 characters')
    .escape(),
  
  validate
];

// Profile update validation
const validateProfileUpdate = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  
  body('bio')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Bio must not exceed 1000 characters')
    .escape(),
  
  body('phone')
    .optional()
    .trim()
    .matches(/^\+?[\d\s-()]+$/)
    .withMessage('Please provide a valid phone number'),
  
  validate
];

// Connection validation
const validateConnection = [
  body('connected_user_id')
    .isInt({ min: 1 })
    .withMessage('Valid connected user ID is required'),
  
  validate
];

// Report validation
const validateReport = [
  body('reported_id')
    .isInt({ min: 1 })
    .withMessage('Valid reported user ID is required'),
  
  body('reason')
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Reason must be between 10 and 500 characters')
    .escape(),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description must not exceed 1000 characters')
    .escape(),
  
  validate
];

// Sanitize input helper
const sanitizeInput = (req, res, next) => {
  // Recursively sanitize string values
  const sanitize = (obj) => {
    for (let key in obj) {
      if (typeof obj[key] === 'string') {
        obj[key] = validator.escape(obj[key].trim());
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitize(obj[key]);
      }
    }
  };
  
  if (req.body) {
    sanitize(req.body);
  }
  
  next();
};

module.exports = {
  validate,
  validateRegistration,
  validateLogin,
  validateReview,
  validateProfileUpdate,
  validateConnection,
  validateReport,
  sanitizeInput
};

