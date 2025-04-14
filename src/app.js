const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
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

const app = express();

// Middleware
app.use(cors({
    origin: [        'http://localhost:3000',
        'http://192.168.0.102:3000'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());



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

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
});

module.exports = app;







