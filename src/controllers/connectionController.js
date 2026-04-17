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

            // Check for duplicate pending/accepted requests
            const [existing] = await pool.execute(
                `SELECT id, status FROM connections 
                 WHERE (user_id = ? AND connected_user_id = ?) 
                    OR (user_id = ? AND connected_user_id = ?)`,
                [user_id, connected_user_id, connected_user_id, user_id]
            );

            if (existing.length > 0) {
                const currentStatus = existing[0].status;
                if (currentStatus === 'pending' || currentStatus === 'accepted') {
                    return res.status(409).json({ error: `A connection request is already ${currentStatus} between these users` });
                }
            }

            const [result] = await pool.execute(
                'INSERT INTO connections (user_id, connected_user_id, status) VALUES (?, ?, "pending")',
                [user_id, connected_user_id]
            );

            // [Hook] Dispatch to Activity Feed as a request
            try {
                await pool.execute(
                    "INSERT INTO activity_feed (actor_id, action_type, target_id, action_data) VALUES (?, 'connection_request', ?, ?)",
                    [user_id, result.insertId, JSON.stringify({ to_user: connected_user_id })]
                );
            } catch (e) {
                console.error('Failed to log connection request to feed:', e);
            }

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

            // [Hook] Dispatch to Activity Feed if accepted
            if (status === 'accepted') {
                try {
                    // We need the original requester's user_id from the connection
                    const [conn] = await pool.execute('SELECT user_id FROM connections WHERE id = ?', [id]);
                    if (conn.length > 0) {
                        await pool.execute(
                            "INSERT INTO activity_feed (actor_id, action_type, target_id, action_data) VALUES (?, 'connected', ?, ?)",
                            [userId, id, JSON.stringify({ with_user: conn[0].user_id })]
                        );
                    }
                } catch (e) {
                    console.error('Failed to log connection to feed:', e);
                }
            }

            res.json({ message: 'Connection status updated successfully' });
        } catch (err) {
            console.error('Error updating connection:', err);
            res.status(500).json({ error: 'Failed to update connection status' });
        }
    },
    deleteConnection: async (req, res) => {
        try {
            const { id } = req.params;
            const userId = req.user.userId || req.user.id;

            // Users can only delete connections they are part of
            const [result] = await pool.execute(
                'DELETE FROM connections WHERE id = ? AND (user_id = ? OR connected_user_id = ?)',
                [id, userId, userId]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Connection not found or unauthorized' });
            }

            // Cleanup related notifications
            try {
                await pool.execute("DELETE FROM activity_feed WHERE action_type = 'connection_request' AND target_id = ?", [id]);
            } catch (e) {
                console.error('Failed to cleanup connection notifications:', e);
            }

            res.json({ message: 'Connection or request removed successfully' });
        } catch (err) {
            console.error('Error deleting connection:', err);
            res.status(500).json({ error: 'Failed to remove connection' });
        }
    }
};

module.exports = connectionController;