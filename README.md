# Rearview API

A RESTful API service for managing user profiles and reviews.

## Features

- User management (signup, profile retrieval)
- Review system
- MySQL database integration
- Express.js backend

## API Endpoints

### Base URL
`http://localhost:3000/api`

### Endpoints

#### User Signup
- **POST** `/signup`
- Creates new user account
- Required fields: name, email
- Optional fields: bio, photo_url

#### Get User Profile
- **GET** `/user/:id`
- Retrieves user details by ID

#### Add Review
- **POST** `/review`
- Creates new review
- Required fields: reviewer_id, reviewed_id, rating, comment

## Project Structure

# Streamlined Project Structure

├── README.md
├── node_modules
├── tests
│   └── test-db.js
├── package.json
├── package-lock.json
├── src/
│   ├── config/
│   │   └── database.js     # Database configuration
│   ├── controllers/        # Business logic
│   │   ├── reviewController.js
│   │   └── userController.js
│   ├── routes/
│   │   ├── index.js
│   │   ├── reviewRoutes.js
│   │   └── userRoutes.js
│   └── app.js             # Express app setup
├── database/              # Database related files
│   └── Rearview.sql
└── server.js


## Setup

1. Install dependencies:
```bash
npm install
