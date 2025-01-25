// src/controllers/userController.js
const bcrypt = require('bcrypt'); // bcrypt for password hashing
const jwt = require('jsonwebtoken');
const pool = require('../config/database'); // Assuming you're using MySQL

const userController = {
    // Get all users
    getUsers: async (req, res) => {
        try {
            const [rows] = await pool.execute('SELECT * FROM users');
            res.status(200).json(rows); // Return rows from the query
        } catch (err) {
            console.error('Error fetching users:', err.message);
            res.status(500).json({ error: 'An error occurred while fetching users. Please try again later.' });
        }
    },

    // Create a new user
    createUser: async (req, res) => {
        try {
            const { name, email, password } = req.body; // Assuming you're using only name, email, password for registration

            // Validate required fields
            if (!name || !email || !password) {
                console.error("Missing required fields:", { name, email, password });
                return res.status(400).json({ error: 'Name, email, and password are required.' });
            }

            // Hash the password before saving it
            const hashedPassword = await bcrypt.hash(password, 10); // Hash password

            // SQL query to insert the new user into the database
            const query = 'INSERT INTO users (name, email, password) VALUES (?, ?, ?)';
            const [result] = await pool.execute(query, [name, email, hashedPassword]);

            // Check if insertion was successful
            if (result.affectedRows > 0) {
                res.status(201).json({
                    message: 'User created successfully',
                    userId: result.insertId
                });
            } else {
                res.status(500).json({ error: 'An error occurred while creating the user. Please try again later.' });
            }
        } catch (err) {
            console.error("Error during user creation:", err.message);
            res.status(500).json({ error: 'An error occurred while creating the user. Please try again later.' });
        }
    },

    // Login user
    loginUser: async (req, res) => {
        try {
          const { email, password } = req.body;
          
          // Check if the user exists
          const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
          if (rows.length === 0) {
            return res.status(400).json({ error: 'Invalid email or password' });
          }
    
          // Compare passwords
          const user = rows[0];
          const isMatch = await bcrypt.compare(password, user.password);
          if (!isMatch) {
            return res.status(400).json({ error: 'Invalid email or password' });
          }
    
          // Generate a JWT token
          const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    
          // Respond with the user data and token
          res.status(200).json({
            message: 'Login successful',
            token,
            user: { id: user.id, name: user.name, email: user.email }
          });
        } catch (err) {
          console.error('Error during login:', err.message);
          res.status(500).json({ error: 'An error occurred during login' });
        }
      }

};

module.exports = userController;
