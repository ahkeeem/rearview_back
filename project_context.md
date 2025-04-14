# Rearview Project Context

## Database Structure
- users (with admin role support)
- reviews
- verifications
- reports
- user_sessions
- activity_logs
- connections (with request status: pending/accepted/rejected)
- conversations
- conversation_participants
- messages (with sender_id, conversation_id, content)

## Implemented Features
1. User Management
   - Registration
   - Login with session management
   - Activity logging
   - Profile management

2. Admin System
   - Admin role verification
   - Verification review capabilities
   - Protected admin routes

3. Authentication
   - JWT token implementation
   - Session management
   - Admin middleware
   - Auth middleware

4. Trust Score System
   - 100-point scale calculation
   - Weighted components (60% reviews, 25% verification, 15% connections)
   - Time decay factor for reviews
   - Integration with user stats

5. Report Management
   - Report submission
   - Admin review system
   - Status tracking
   - Integration with trust scores

6. Connection System
   - Connection requests (pending by default)
   - Accept/Reject functionality
   - Status tracking (pending/accepted/rejected)
   - Bi-directional connection representation
   - Single database entry per connection
   - Connection count based on accepted status only

7. Messaging System
   - Real-time messaging with Socket.IO
   - Conversation creation between connected users
   - Message history with sender details
   - Conversation participants tracking
   - Message content and timestamp storage
   - User authorization checks for conversations

## API Design
1. User Routes
   - POST /api/users/ (create user)
   - POST /api/users/login
   - GET /api/users/ (get all users)
   - GET /api/users/:id/stats (get user trust score and stats)

2. Admin Routes
   - PUT /api/admin/verifications/:id (review verification)
   - GET /api/admin/verifications/pending

3. Report Routes
   - POST /api/reports (create report)
   - GET /api/reports (admin: get all reports)
   - PUT /api/reports/:id/status (update report status)

4. Connection Routes
   - POST /api/connections (create connection request)
   - GET /api/connections (get user connections with status)
   - PUT /api/connections/:id/status (accept/reject connection)

5. Message Routes
   - POST /api/messages (create new message)
   - GET /api/messages/conversation/:conversationId (get conversation messages)
   - POST /api/conversations (create new conversation)

## WebSocket Events
- join-conversation
- send-message
- new-message
- typing
- user-typing

## Frontend Integration Points
1. Authentication
   - JWT token handling
   - User identification from token
   - Session management

2. Conversation Management
   - Create conversations with connected users
   - Display conversation history
   - Show participant details

3. Messaging Interface
   - Real-time message display
   - Message sending functionality
   - Conversation participant information
   - Message timestamps

4. WebSocket Integration
   - Real-time updates
   - Connection status
   - Socket.IO endpoint (http://localhost:4000)

## Tech Stack
- Node.js/Express
- MySQL
- JWT Authentication
- Socket.IO for real-time features

## Test Credentials
Test User: Simon Down
Email: simondown@example.com
Password: TestPass123!

## Next Steps
1. Frontend Development
   - Chat interface implementation
   - Real-time message display
   - Conversation management UI
2. Enhanced Admin Dashboard
3. User Experience Improvements
