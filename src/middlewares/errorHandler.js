/**
 * Global Error Handler Middleware
 * ─────────────────────────────────────────────────────────────────
 * Catches all unhandled errors from route handlers and translates
 * them into safe, consistent JSON responses.
 * 
 * Placed LAST in app.js after all routes.
 */

const logger = require('../utils/logger');

// ── Typed application error ───────────────────────────────────────────────
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', meta = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.meta = meta;
    this.isOperational = true; // Expected errors — don't crash
  }
}

// ── MySQL error → HTTP status map ─────────────────────────────────────────
const DB_ERROR_MAP = {
  ER_DUP_ENTRY:         { status: 409, message: 'A record with these details already exists.' },
  ER_NO_SUCH_TABLE:     { status: 500, message: 'A required database table is missing. Try again shortly.', code: 'SCHEMA_MISSING' },
  ER_BAD_FIELD_ERROR:   { status: 500, message: 'Database schema mismatch.', code: 'SCHEMA_MISMATCH' },
  ER_ACCESS_DENIED:     { status: 500, message: 'Database access denied.', code: 'DB_AUTH' },
  ER_CON_COUNT_ERROR:   { status: 503, message: 'Service temporarily unavailable. Please try again.', code: 'DB_OVERLOAD' },
  ECONNREFUSED:         { status: 503, message: 'Cannot reach database. Please try again.', code: 'DB_UNREACHABLE' },
  ETIMEDOUT:            { status: 503, message: 'Request timed out. Please try again.', code: 'TIMEOUT' },
};

const isDev = () => process.env.NODE_ENV !== 'production';

// ── Main error handler ────────────────────────────────────────────────────
const globalErrorHandler = (err, req, res, next) => {
  // Don't double-respond
  if (res.headersSent) return next(err);

  // Structured log with request context
  logger.error('Unhandled error', {
    message:    err.message,
    code:       err.code,
    stack:      isDev() ? err.stack : undefined,
    request: {
      method:   req.method,
      url:      req.originalUrl,
      ip:       req.ip,
      userId:   req.user?.userId || req.user?.id || 'anonymous'
    }
  });

  // ── Already an operational AppError ──
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      error:   err.message,
      code:    err.code,
      ...(isDev() && err.meta && { meta: err.meta })
    });
  }

  // ── MySQL / DB error ──
  const dbMap = DB_ERROR_MAP[err.code];
  if (dbMap) {
    return res.status(dbMap.status).json({
      error: dbMap.message,
      code:  dbMap.code || err.code,
      ...(isDev() && { detail: err.message })
    });
  }

  // ── Validation errors (express-validator) ──
  if (err.type === 'validation') {
    return res.status(422).json({
      error:   'Validation failed',
      details: err.errors,
      code:    'VALIDATION_ERROR'
    });
  }

  // ── JWT errors ──
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Invalid or expired session. Please log in again.', code: 'JWT_INVALID' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Session expired. Please log in again.', code: 'JWT_EXPIRED' });
  }

  // ── Payload too large ──
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request too large.', code: 'PAYLOAD_TOO_LARGE' });
  }

  // ── Malformed JSON ──
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body.', code: 'BAD_JSON' });
  }

  // ── Unknown / unexpected error ──  
  // In production, never expose raw message
  const message = isDev() ? err.message : 'An unexpected error occurred. Please try again.';

  return res.status(err.statusCode || 500).json({
    error:  message,
    code:   'INTERNAL_ERROR',
    ...(isDev() && { stack: err.stack?.split('\n').slice(0, 5) })
  });
};

// ── 404 handler (place BEFORE globalErrorHandler but AFTER routes) ────────
const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: `Route not found: ${req.method} ${req.originalUrl}`,
    code:  'NOT_FOUND'
  });
};

module.exports = { globalErrorHandler, notFoundHandler, AppError };
