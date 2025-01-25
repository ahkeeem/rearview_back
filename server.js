const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const userRoutes = require('./src/routes/userRoutes'); // Import your routes
const userController = require('./src/controllers/userController');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Route for API Home
app.get('/api', (req, res) => {
  res.send('Welcome to the API');
});

// User-related routes (including login, registration, etc.)
app.use('/api/users', userRoutes); 
app.post('/api/login', userController.loginUser); 

// Start the server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
