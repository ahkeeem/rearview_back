const pool = require('../config/database');

const conversationController = {
    createConversation: async (req, res) => {
        try {
            const { userId } = req.body;  // Match the incoming request format
            const currentUserId = req.user.userId;  // Match token payload
            
            console.log('Debug values:', {
                userId,
                currentUserId,
                body: req.body
            });

            // Validate parameters
            if (!userId || !currentUserId) {
                return res.status(400).json({ 
                    error: 'Invalid parameters',
                    userId: !!userId,
                    currentUserId: !!currentUserId
                });
            }

            // When querying database, map to database field names
            const [connections] = await pool.execute(
                'SELECT * FROM connections WHERE (user_id = ? AND connected_user_id = ?) OR (user_id = ? AND connected_user_id = ?)',
                [currentUserId, userId, userId, currentUserId]
            );

            if (connections.length === 0) {
                console.log('Connection check failed: Users not connected');
                return res.status(403).json({ error: 'Users must be connected to start a conversation' });
            }

            console.log('Users are connected, proceeding with conversation creation');

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

                console.log('Conversation created successfully:', { conversationId });
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
            console.error('Values causing error:', {
                userId: req.body.userId,
                currentUserId: req.user?.userId
            });
            res.status(500).json({ 
                error: 'Failed to create conversation',
                details: err.message
            });
        }
    },    getUserConversations: async (req, res) => {
        try {
            const userId = req.user.id;
            const [conversations] = await pool.execute(
                `SELECT DISTINCT c.* 
                FROM conversations c
                JOIN conversation_participants cp ON c.id = cp.conversation_id
                JOIN connections conn ON 
                    (conn.user_id = ? AND conn.connected_user_id = cp.user_id) OR 
                    (conn.user_id = cp.user_id AND conn.connected_user_id = ?)
                WHERE cp.user_id != ?`,
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