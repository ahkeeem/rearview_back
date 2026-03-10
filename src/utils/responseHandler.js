// Standardized API response handler
const sendSuccess = (res, data, message = 'Success', statusCode = 200) => {
  res.status(statusCode).json({
    success: true,
    message,
    data
  });
};

const sendError = (res, message = 'An error occurred', statusCode = 500, errors = null) => {
  const response = {
    success: false,
    message,
    ...(errors && { errors })
  };
  
  res.status(statusCode).json(response);
};

const sendValidationError = (res, errors) => {
  res.status(400).json({
    success: false,
    message: 'Validation failed',
    errors
  });
};

const sendUnauthorized = (res, message = 'Unauthorized') => {
  res.status(401).json({
    success: false,
    message
  });
};

const sendForbidden = (res, message = 'Forbidden') => {
  res.status(403).json({
    success: false,
    message
  });
};

const sendNotFound = (res, message = 'Resource not found') => {
  res.status(404).json({
    success: false,
    message
  });
};

module.exports = {
  sendSuccess,
  sendError,
  sendValidationError,
  sendUnauthorized,
  sendForbidden,
  sendNotFound
};

