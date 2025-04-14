
ALTER TABLE reports
ADD COLUMN description TEXT NULL;


-- User Table Updates (only adding new columns)
ALTER TABLE users
ADD COLUMN phone VARCHAR(20) UNIQUE NULL,
ADD COLUMN is_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN role ENUM('user', 'admin') DEFAULT 'user';

-- Rest of the schema remains the same
-- Verification System
CREATE TABLE verifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    document_url VARCHAR(255) NOT NULL,
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    reviewed_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Reporting System
CREATE TABLE reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reporter_id INT NOT NULL,
    reported_id INT NOT NULL,
    reason TEXT NOT NULL,
    status ENUM('pending', 'reviewed', 'resolved') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (reporter_id) REFERENCES users(id),
    FOREIGN KEY (reported_id) REFERENCES users(id)
);

-- Session Management
CREATE TABLE user_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Activity Tracking
CREATE TABLE activity_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    description TEXT NULL,
    ip_address VARCHAR(45) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Performance Indexes
CREATE INDEX idx_verification_status ON verifications(status);
CREATE INDEX idx_report_status ON reports(status);
CREATE INDEX idx_session_user ON user_sessions(user_id);
CREATE INDEX idx_session_token ON user_sessions(token);
CREATE INDEX idx_activity_user ON activity_logs(user_id);
CREATE INDEX idx_activity_type ON activity_logs(action_type);    



select * from users;

SELECT * FROM reviews;

UPDATE users SET role = 'admin' WHERE id = 11;


CREATE TABLE conversations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE conversation_participants (
    conversation_id INT,
    user_id INT,
    PRIMARY KEY (conversation_id, user_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE messages (
    id INT PRIMARY KEY AUTO_INCREMENT,
    conversation_id INT,
    sender_id INT,
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id),
    FOREIGN KEY (sender_id) REFERENCES users(id)
);


select * from conversation_participants;

SHOW TABLE STATUS LIKE 'conversations';




curl -X PUT \
   -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjExLCJpYXQiOjE3MzkyMzA1MDIsImV4cCI6MTczOTIzNDEwMn0.TbP6XITOA0lja2dp3urbD55GZlNJXSQzjFralBuO6Aw" \
  -H "Content-Type: application/json" \
  -d '{"status": "VERIFIED"}' \
  http://localhost:4000/api/admin/verifications/5


Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjExLCJpYXQiOjE3MzkyMzA1MDIsImV4cCI6MTczOTIzNDEwMn0.TbP6XITOA0lja2dp3urbD55GZlNJXSQzjFralBuO6Aw

curl -X POST http://localhost:4000/api/users/login \
-H "Content-Type: application/json" \
-d '{"email": "simon@example.com", "password": "TestPass123!"}'

curl http://localhost:4000/api/reports \
-H "Authorization: Bearer ADMIN_TOKEN_HERE"


curl http://localhost:4000/api/users/1/stats \
-H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjExLCJpYXQiOjE3Mzk2NTY3MjEsImV4cCI6MTczOTc0MzEyMX0.nRGmrunVQK8rFlCfJoeCZFzS0XEEpfZ4jYxOlqewGzU"

curl -X POST "http://localhost:4000/api/reports" \
-H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjIsImlhdCI6MTczOTY2MDcyOSwiZXhwIjoxNzM5NzQ3MTI5fQ.XQY7stvsqgazePaHiOkmZ6jR_XuNkIyUT4adT7MKlX8"\
-H "Content-Type: application/json" \
-d '{"reported_user_id": 1, "reason": "Suspicious behavior", "description": "Test report"}'

