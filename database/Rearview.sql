-- Create the database and tables 

CREATE DATABASE rearview;

USE rearview;


DROP TABLE IF EXISTS users;
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    password VARCHAR(255) NOT NULL,
    bio TEXT,
    photo_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reviewer_id INT,
    reviewed_id INT,
    rating INT CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    FOREIGN KEY (reviewer_id) REFERENCES users(id),
    FOREIGN KEY (reviewed_id) REFERENCES users(id)
);


DROP TABLE IF EXISTS reviews;
CREATE TABLE reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reviewer_id INT NOT NULL,              -- ID of the user who left the review
    reviewee_id INT NOT NULL,              -- ID of the user or product being reviewed
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),                 -- Rating between 1 and 5
    comment TEXT,                          -- Review comment (optional)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- Timestamp of when the review was created
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,  -- Timestamp for update
    FOREIGN KEY (reviewer_id) REFERENCES users(id),  -- Assuming we are reviewing users
    FOREIGN KEY (reviewee_id) REFERENCES users(id)   -- Could be a product table if applicable
);


SELECT * FROM users
WHERE email like '%yahoo%';


SHOW TABLES;
