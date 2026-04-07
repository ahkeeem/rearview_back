const pool = require('../config/database');

const threadController = {
    // Thread Initialization Node
    createThread: async (req, res) => {
        try {
            const { entity_id, title, initial_comment } = req.body;
            const author_id = req.user.userId || req.user.id;

            if (!entity_id || !title) {
                return res.status(400).json({ error: 'Entity ID and Title are required.' });
            }

            const connection = await pool.getConnection();
            try {
                await connection.beginTransaction();

                const [threadRes] = await connection.execute(
                    'INSERT INTO threads (entity_id, title, author_id) VALUES (?, ?, ?)',
                    [entity_id, title, author_id]
                );

                const threadId = threadRes.insertId;

                if (initial_comment) {
                    await connection.execute(
                        'INSERT INTO comments (thread_id, author_id, content) VALUES (?, ?, ?)',
                        [threadId, author_id, initial_comment]
                    );
                }

                await connection.commit();
                res.status(201).json({ message: 'Thread created successfully', threadId });
            } catch (err) {
                await connection.rollback();
                throw err;
            } finally {
                connection.release();
            }
        } catch (err) {
            console.error('Error creating discussion thread:', err);
            res.status(500).json({ error: 'Failed to create discussion.' });
        }
    },

    // Fetch entity's isolated discussion board
    getThreadsByEntity: async (req, res) => {
        try {
            const { entityId } = req.params;
            
            // Includes comment counts
            const query = `
                SELECT t.*, u.name as author_name, u.photo_url as author_avatar,
                       (SELECT COUNT(*) FROM comments c WHERE c.thread_id = t.id) as comment_count
                FROM threads t
                JOIN users u ON t.author_id = u.id
                WHERE t.entity_id = ?
                ORDER BY t.created_at DESC
            `;
            const [threads] = await pool.execute(query, [entityId]);
            res.status(200).json(threads);

        } catch (err) {
            console.error('Error fetching threads:', err);
            res.status(500).json({ error: 'Failed to retrieve entity discussions.' });
        }
    },

    // Reply to an active discussion
    addComment: async (req, res) => {
        try {
            const { content } = req.body;
            const { threadId } = req.params;
            const author_id = req.user.userId || req.user.id;

            if (!content) {
                return res.status(400).json({ error: 'Comment content cannot be empty.' });
            }

            const [result] = await pool.execute(
                'INSERT INTO comments (thread_id, author_id, content) VALUES (?, ?, ?)',
                [threadId, author_id, content]
            );

            res.status(201).json({ message: 'Comment posted', commentId: result.insertId });

        } catch (err) {
            console.error('Error posting comment:', err);
            res.status(500).json({ error: 'Failed to dispatch comment into threading system.' });
        }
    },

    // Dig down into a specific thread
    getComments: async (req, res) => {
        try {
            const { threadId } = req.params;

            // Fetch Parent Thread
            const [threadInfo] = await pool.execute(
                `SELECT t.*, u.name as author_name, u.photo_url as author_avatar 
                 FROM threads t JOIN users u ON t.author_id = u.id WHERE t.id = ?`,
                [threadId]
            );

            if (threadInfo.length === 0) {
                 return res.status(404).json({ error: 'Thread nullified or completely vanished.' });
            }

            // Fetch Children
            const [comments] = await pool.execute(
                `SELECT c.*, u.name as author_name, u.photo_url as author_avatar
                 FROM comments c
                 JOIN users u ON c.author_id = u.id
                 WHERE c.thread_id = ?
                 ORDER BY c.created_at ASC`,
                [threadId]
            );

            res.status(200).json({
                 thread: threadInfo[0],
                 comments: comments
            });

        } catch (err) {
            console.error('Error extracting thread contents:', err);
            res.status(500).json({ error: 'Failed to access active thread discussion block.' });
        }
    }
};

module.exports = threadController;
