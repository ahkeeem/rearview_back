const pool = require('../config/database');

const conversationController = {
    createConversation: async (req, res) => {
        try {
            const { userId } = req.body;  // Match the incoming request format
            const currentUserId = req.user.userId || req.user.id;  // Match token payload

            // Validate parameters
            if (!userId || !currentUserId) {
                return res.status(400).json({ 
                    error: 'Invalid parameters',
                    userId: !!userId,
                    currentUserId: !!currentUserId
                });
            }

            // Check if users are connected
            const [connections] = await pool.execute(
                'SELECT * FROM connections WHERE ((user_id = ? AND connected_user_id = ?) OR (user_id = ? AND connected_user_id = ?)) AND status = "accepted"',
                [currentUserId, userId, userId, currentUserId]
            );

            if (connections.length === 0) {
                return res.status(403).json({ error: 'Users must be connected to start a conversation' });
            }

            // Check if conversation already exists
            const [existingConversations] = await pool.execute(`
                SELECT c.id 
                FROM conversations c
                JOIN conversation_participants cp1 ON c.id = cp1.conversation_id
                JOIN conversation_participants cp2 ON c.id = cp2.conversation_id
                WHERE cp1.user_id = ? AND cp2.user_id = ?
            `, [currentUserId, userId]);

            if (existingConversations.length > 0) {
                return res.status(200).json({
                    message: 'Conversation already exists',
                    conversationId: existingConversations[0].id
                });
            }

            // Continue with conversation creation...
            const connection = await pool.getConnection();
            await connection.beginTransaction();

            try {
                // Create the conversation
                const [conversationResult] = await connection.execute(
                    'INSERT INTO conversations () VALUES ()'
                );

                const conversationId = conversationResult.insertId;

                // Add participants
                await connection.execute(
                    'INSERT INTO conversation_participants (conversation_id, user_id) VALUES (?, ?), (?, ?)',
                    [conversationId, currentUserId, conversationId, userId]
                );

                await connection.commit();
                connection.release();

                res.status(201).json({
                    message: 'Conversation created successfully',
                    conversationId
                });
            } catch (err) {
                await connection.rollback();
                connection.release();
                throw err;
            }
        } catch (err) {
            console.error('Error creating conversation:', err);
            res.status(500).json({ 
                error: 'Failed to create conversation',
                details: err.message
            });
        }
    },
    
    getUserConversations: async (req, res) => {
        try {
            const userId = req.user.userId || req.user.id;
            const [conversations] = await pool.execute(
                `SELECT DISTINCT 
                    c.id,
                    c.created_at,
                    c.updated_at,
                    (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
                    (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_time,
                    (SELECT name FROM users u 
                     JOIN conversation_participants cp2 ON u.id = cp2.user_id 
                     WHERE cp2.conversation_id = c.id AND cp2.user_id != ? LIMIT 1) as participant_name,
                    (SELECT id FROM users u 
                     JOIN conversation_participants cp2 ON u.id = cp2.user_id 
                     WHERE cp2.conversation_id = c.id AND cp2.user_id != ? LIMIT 1) as participant_id
                FROM conversations c
                JOIN conversation_participants cp ON c.id = cp.conversation_id
                WHERE cp.user_id = ?
                ORDER BY c.updated_at DESC`,
                [userId, userId, userId]
            );
            
            res.status(200).json(conversations);
        } catch (err) {
            console.error('Error fetching conversations:', err);
            res.status(500).json({ error: 'Failed to fetch conversations' });
        }
    },

    markAsRead: async (req, res) => {
        try {
            await pool.execute(
                'UPDATE conversations SET unread_count = 0 WHERE id = ?',
                [req.params.id]
            );
            res.json({ success: true });
        } catch (error) {
            console.error('Error marking conversation as read:', error);
            res.status(500).json({ error: 'Failed to mark conversation as read' });
        }
    },

    deleteConversation: async (req, res) => {
        try {
            await pool.execute(
                'DELETE FROM conversations WHERE id = ?',
                [req.params.id]
            );
            await pool.execute(
                'DELETE FROM messages WHERE conversation_id = ?',
                [req.params.id]
            );
            res.json({ success: true });
        } catch (error) {
            console.error('Error deleting conversation:', error);
            res.status(500).json({ error: 'Failed to delete conversation' });
        }
    }
};

module.exports = conversationController;