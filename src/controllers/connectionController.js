const pool = require('../config/database');

const connectionController = {
    createConnection: async (req, res) => {
        try {
            const { connected_user_id } = req.body;
            const user_id = req.user.userId || req.user.id;
            
            if (!connected_user_id) {
                return res.status(400).json({ error: 'Connected user ID is required' });
            }
            
            if (user_id === connected_user_id) {
                return res.status(400).json({ error: 'Cannot connect to yourself' });
            }

            const [result] = await pool.execute(
                'INSERT INTO connections (user_id, connected_user_id, status) VALUES (?, ?, "pending")',
                [user_id, connected_user_id]
            );

            res.status(201).json({
                message: 'Connection request sent successfully',
                connectionId: result.insertId
            });
        } catch (err) {
            console.error('Error creating connection:', err);
            res.status(500).json({ error: 'Failed to create connection' });
        }
    },
    getConnections: async (req, res) => {
        try {
            const userId = req.user.userId || req.user.id;
            const [connections] = await pool.execute(`
                SELECT 
                    c.*,
                    u.name as connected_user_name,
                    CASE 
                        WHEN c.user_id = ? THEN 'outgoing'
                        ELSE 'incoming'
                    END as direction
                FROM connections c
                JOIN users u ON (
                    CASE 
                        WHEN c.user_id = ? THEN c.connected_user_id
                        ELSE c.user_id
                    END = u.id
                )
                WHERE c.user_id = ? OR c.connected_user_id = ?`,
                [userId, userId, userId, userId]
            );
            
            res.json(connections);
        } catch (err) {
            console.error('Error fetching connections:', err);
            res.status(500).json({ error: 'Failed to fetch connections' });
        }
    },    updateConnectionStatus: async (req, res) => {
        try {
            const { id } = req.params;
            const { status } = req.body;
            const userId = req.user.userId || req.user.id;

            if (!status || !['accepted', 'rejected'].includes(status)) {
                return res.status(400).json({ error: 'Invalid status. Must be accepted or rejected' });
            }

            const [result] = await pool.execute(
                'UPDATE connections SET status = ? WHERE id = ? AND connected_user_id = ?',
                [status, id, userId]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Connection request not found' });
            }

            res.json({ message: 'Connection status updated successfully' });
        } catch (err) {
            console.error('Error updating connection:', err);
            res.status(500).json({ error: 'Failed to update connection status' });
        }
    }
};

module.exports = connectionController;