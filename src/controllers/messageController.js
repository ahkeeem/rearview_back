const pool = require('../config/database');

const messageController = {
    createMessage: async (req, res) => {
        try {
            const { conversationId, content } = req.body;
            const userId = req.user.userId || req.user.id;

            if (!conversationId || !content) {
                return res.status(400).json({ error: 'Conversation ID and content are required' });
            }

            // Verify user is a participant in the conversation
            const [participants] = await pool.execute(
                'SELECT user_id FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
                [conversationId, userId]
            );

            if (participants.length === 0) {
                return res.status(403).json({ error: 'You are not a participant in this conversation' });
            }

            // Insert message
            const [result] = await pool.execute(
                'INSERT INTO messages (conversation_id, sender_id, content) VALUES (?, ?, ?)',
                [conversationId, userId, content]
            );

            // Update conversation updated_at timestamp and increment unread count
            await pool.execute(
                'UPDATE conversations SET updated_at = NOW(), unread_count = unread_count + 1 WHERE id = ?',
                [conversationId]
            );

            res.status(201).json({
                message: 'Message sent successfully',
                messageId: result.insertId
            });
        } catch (err) {
            console.error('Error creating message:', err);
            res.status(500).json({ error: 'Failed to send message' });
        }
    },

    getMessagesByConversation: async (req, res) => {
        try {
            const { conversationId } = req.params;
            const userId = req.user.userId || req.user.id;

            // Verify user is a participant
            const [participants] = await pool.execute(
                'SELECT user_id FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
                [conversationId, userId]
            );

            if (participants.length === 0) {
                return res.status(403).json({ error: 'You are not a participant in this conversation' });
            }

            const [messages] = await pool.execute(
                `SELECT 
                    m.id,
                    m.conversation_id,
                    m.sender_id,
                    m.content,
                    m.created_at,
                    u.name as sender_name
                FROM messages m
                JOIN users u ON m.sender_id = u.id
                WHERE m.conversation_id = ? 
                ORDER BY m.created_at ASC`,
                [conversationId]
            );
            res.status(200).json(messages);
        } catch (err) {
            console.error('Error fetching messages:', err);
            res.status(500).json({ error: 'Failed to fetch messages' });
        }
    }
};

module.exports = messageController;
