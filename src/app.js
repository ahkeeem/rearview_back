const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const userRoutes = require('./routes/userRoutes'); // Assuming user routes are defined here
const reviewRoutes = require('./routes/reviewRoutes'); // Assuming review routes are defined here

const app = express();

// Middleware
app.use(cors()); // Enable Cross-Origin Resource Sharing
app.use(bodyParser.json()); // Parse incoming JSON requests

// Routes
app.use('/api/users', userRoutes); // All routes related to users
app.use('/api/reviews', reviewRoutes); // All routes related to reviews
app.get('/', (req, res) => {       // Home route
    res.send('"Welcome to Rearview! – Where Reputation Thrives.');
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong. Please try again later.' });
});

// Export the app
module.exports = app;
