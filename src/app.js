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
const barterRoutes = require('./routes/barterRoutes');

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
const path = require('path');
app.use('/uploads', (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}, express.static(path.join(__dirname, '../uploads')));

// Health Check
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV 
    });
});

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
app.use('/api/barter', barterRoutes);

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

// Health check — also tests DB connectivity
app.get('/health', async (req, res) => {
    try {
        const [rows] = await require('./config/database').execute('SELECT 1');
        res.status(200).json({
            status: 'ok',
            db: 'connected',
            uptime: Math.floor(process.uptime()),
            env: process.env.NODE_ENV || 'unknown',
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.status(503).json({
            status: 'degraded',
            db: 'unreachable',
            error: err.message
        });
    }
});

// ── Error handling ── must be LAST ────────────────────────────────────────
const { globalErrorHandler, notFoundHandler } = require('./middlewares/errorHandler');
app.use(notFoundHandler);
app.use(globalErrorHandler);

module.exports = app;








