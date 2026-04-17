const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const messageHandler = (io) => {
    // Authentication middleware for socket connections
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth?.token;
            if (!token) {
                return next(new Error('Authentication error: No token provided'));
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.userId = decoded.userId || decoded.id;
            socket.user = {
                userId: socket.userId,
                name: decoded.name,
                email: decoded.email
            };
            next();
        } catch (err) {
            next(new Error('Authentication error: Invalid token'));
        }
    });

    io.on('connection', (socket) => {
        console.log(`User ${socket.userId} connected to socket`);

        socket.on('join-conversation', async (conversationId) => {
            try {
                // Verify user is a participant
                const [participants] = await pool.execute(
                    'SELECT user_id FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
                    [conversationId, socket.userId]
                );

                if (participants.length > 0) {
                    socket.join(`conversation-${conversationId}`);
                    console.log(`User ${socket.userId} joined conversation ${conversationId}`);
                } else {
                    socket.emit('error', { message: 'Not a participant in this conversation' });
                }
            } catch (err) {
                console.error('Error joining conversation:', err);
                socket.emit('error', { message: 'Failed to join conversation' });
            }
        });
        
        socket.on('send-message', async (data) => {
            try {
                const { conversationId, content, messageId } = data;
                const userId = socket.userId;

                if (!conversationId || !content) {
                    socket.emit('error', { message: 'Missing conversationId or content' });
                    return;
                }

                // Verify user is a participant
                const [participants] = await pool.execute(
                    'SELECT user_id FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
                    [conversationId, userId]
                );

                if (participants.length === 0) {
                    socket.emit('error', { message: 'Not a participant in this conversation' });
                    return;
                }

                // If messageId is provided, message was already saved via API - just broadcast it
                // Otherwise, save it here (for direct WebSocket sends)
                let finalMessageId = messageId;
                if (!messageId) {
                    // Save message to database (fallback for direct WebSocket sends)
                    const [result] = await pool.execute(
                        'INSERT INTO messages (conversation_id, sender_id, content) VALUES (?, ?, ?)',
                        [conversationId, userId, content]
                    );
                    finalMessageId = result.insertId;

                    // Update conversation timestamp and increment unread count
                    await pool.execute(
                        'UPDATE conversations SET updated_at = NOW(), unread_count = unread_count + 1 WHERE id = ?',
                        [conversationId]
                    );
                }

                // Get sender info
                const [users] = await pool.execute(
                    'SELECT name FROM users WHERE id = ?',
                    [userId]
                );

                // Get the actual message from DB if messageId was provided
                let messageData;
                if (messageId) {
                    const [messages] = await pool.execute(
                        'SELECT id, conversation_id, sender_id, content, created_at FROM messages WHERE id = ?',
                        [messageId]
                    );
                    if (messages.length > 0) {
                        messageData = {
                            id: messages[0].id,
                            conversationId: messages[0].conversation_id,
                            sender_id: messages[0].sender_id,
                            sender_name: users[0]?.name || 'User',
                            content: messages[0].content,
                            created_at: messages[0].created_at,
                            timestamp: messages[0].created_at
                        };
                    }
                }

                // If we don't have messageData yet, construct it
                if (!messageData) {
                    messageData = {
                        id: finalMessageId,
                        conversationId,
                        sender_id: userId,
                        sender_name: users[0]?.name || 'User',
                        content,
                        created_at: new Date().toISOString(),
                        timestamp: new Date().toISOString()
                    };
                }

                // Emit to all participants in the conversation room
                io.to(`conversation-${conversationId}`).emit('new-message', messageData);
                console.log(`Message broadcast in conversation ${conversationId} by user ${userId}`);
            } catch (err) {
                console.error('Error sending message:', err);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        socket.on('typing', (data) => {
            const { conversationId, userId } = data;
            socket.to(`conversation-${conversationId}`).emit('user-typing', {
                userId,
                conversationId
            });
        });

        socket.on('disconnect', () => {
            console.log(`User ${socket.userId} disconnected from socket`);
        });

        socket.on('error', (err) => {
            console.error('Socket error:', err);
        });
    });
};

module.exports = messageHandler;