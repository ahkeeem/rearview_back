const pool = require('../config/database');

// Get all conversations for a user
const getConversations = async (req, res) => {
    const userId = req.user.id;
    try {
        const [conversations] = await pool.execute(`
            SELECT c.*, m.content as last_message, m.created_at as last_message_time,
            u.name as participant_name
            FROM conversations c
            JOIN conversation_participants cp ON c.id = cp.conversation_id
            JOIN users u ON cp.user_id = u.id
            LEFT JOIN messages m ON c.id = m.conversation_id
            WHERE cp.user_id = ?
            ORDER BY c.updated_at DESC`, [userId]
        );
        res.json(conversations);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Get single conversation by ID
const getConversationById = async (req, res) => {
    try {
        const conversation = await Conversation.findById(req.params.id)
            .populate('participants lastMessage');
        res.json(conversation);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Create new conversation
const createConversation = async (req, res) => {
    try {
        const { participants } = req.body;
        const conversation = new Conversation({
            participants: [...participants, req.user._id]
        });
        await conversation.save();
        res.status(201).json(conversation);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const messageController = {
    createMessage: async (req, res) => {
        try {
            const { conversationId, content } = req.body;
            const userId = req.user.userId;

            console.log('Message creation attempt:', {
                conversationId,
                content,
                userId
            });

            // Insert message
            const [result] = await pool.execute(
                'INSERT INTO messages (conversation_id, sender_id, content) VALUES (?, ?, ?)',
                [conversationId, userId, content]
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
            const [messages] = await pool.execute(
                `SELECT 
                    m.*,
                    u.name as sender_name,
                    cp.user_id as recipient_id
                FROM messages m
                JOIN users u ON m.sender_id = u.id
                JOIN conversation_participants cp ON m.conversation_id = cp.conversation_id
                WHERE m.conversation_id = ? 
                AND cp.user_id != m.sender_id
                ORDER BY m.created_at ASC`,
                [conversationId]
            );
            res.status(200).json(messages);
        } catch (err) {
            console.error('Error fetching messages:', err);
            res.status(500).json({ error: 'Failed to fetch messages' });
        }
    }};

module.exports = {
    getConversations,
    getConversationById,
    createConversation,
    ...messageController
};
