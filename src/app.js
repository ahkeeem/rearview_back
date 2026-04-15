require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { securityHeaders, corsOptions } = require('./middlewares/security');
const { apiLimiter } = require('./middlewares/rateLimiter');
const logger = require('./utils/logger');
const userRoutes = require('./routes/userRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const trustRoutes = require('./routes/trustRoutes');
const verificationRoutes = require('./routes/verificationRoutes');
const adminVerificationRoutes = require('./routes/adminVerificationRoutes');
const adminRoutes = require('./routes/adminRoutes');
const reportRoutes = require('./routes/reportRoutes');
const connectionRoutes = require('./routes/connectionRoutes');
const conversationRoutes = require('./routes/conversationRoutes');
const messageRoutes = require('./routes/messageRoutes');
const activityRoutes = require('./routes/activityRoutes');
const entityRoutes = require('./routes/entityRoutes');
const threadRoutes = require('./routes/threadRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const escrowRoutes = require('./routes/escrowRoutes');

const app = express();

// Behind Render/Cloudflare proxies: required for accurate rate limiting (X-Forwarded-For)
app.set('trust proxy', 1);

// Security middleware
app.use(securityHeaders);

// CORS configuration
app.use(cors(corsOptions));

// Body parser
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Request logging
app.use(logger.requestLogger);

// Debug request logging — only in non-production
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`[REQUEST] ${req.method} ${req.originalUrl}`);
    next();
  });
}

// Rate limiting
app.use('/api/', apiLimiter);



// Static files — served with nosniff to prevent XSS via uploaded files
app.use('/uploads', (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'attachment');
  next();
}, express.static('uploads'));

// Routes
app.use('/api/users', userRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/trust', trustRoutes);
app.use('/api/verifications', verificationRoutes);
app.use('/api/admin/verifications', adminVerificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/connections', connectionRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/feed', activityRoutes);
app.use('/api/entities', entityRoutes);
app.use('/api/threads', threadRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/escrow', escrowRoutes);

// Root route with API documentation
app.get('/', (req, res) => {
    res.json({
        message: 'Welcome to Rearview API',
        endpoints: {
            users: {
                base: '/api/users',
                routes: {
                    getUsers: 'GET /',
                    createUser: 'POST /',
                    login: 'POST /login'
                }
            },
            reviews: {
                base: '/api/reviews'
            }
        }
    });
});

// Health check route for Render
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found',
        path: req.originalUrl
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error('Unhandled error', {
        error: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip
    });

    // Don't leak error details in production
    const message = process.env.NODE_ENV === 'production' 
        ? 'Something went wrong. Please try again later.'
        : err.message;

    res.status(err.status || 500).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

module.exports = app;







