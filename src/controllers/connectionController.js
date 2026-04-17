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
                    "INSERT INTO activity_feed (actor_id, action_type, target_id, target_user_id, action_data) VALUES (?, 'connection_request', ?, ?, ?)",
                    [user_id, result.insertId, result.insertId, connected_user_id, JSON.stringify({ to_user: connected_user_id })]
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

            if (!status || !['accepted', 'rejected', 'cancelled'].includes(status)) {
                return res.status(400).json({ error: 'Invalid status. Must be accepted, rejected, or cancelled' });
            }

            // Logic check: only recipient can accept/reject, only sender can cancel
            const [current] = await pool.execute('SELECT user_id, connected_user_id, status FROM connections WHERE id = ?', [id]);
            
            if (current.length === 0) {
                return res.status(404).json({ error: 'Connection request not found' });
            }

            const { user_id, connected_user_id, status: oldStatus } = current[0];

            if (status === 'cancelled') {
                if (userId !== user_id) {
                    return res.status(403).json({ error: 'Only the sender can cancel a request' });
                }
            } else {
                if (userId !== connected_user_id) {
                    return res.status(403).json({ error: 'Only the recipient can accept or reject a request' });
                }
            }

            const [result] = await pool.execute(
                'UPDATE connections SET status = ? WHERE id = ?',
                [status, id]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Connection request not found' });
            }

            // [Hook] Dispatch to Activity Feed if accepted
            if (status === 'accepted') {
                try {
                    await pool.execute(
                        "INSERT INTO activity_feed (actor_id, action_type, target_id, action_data) VALUES (?, 'connected', ?, ?)",
                        [userId, id, JSON.stringify({ with_user: user_id })]
                    );
                } catch (e) {
                    console.error('Failed to log connection to feed:', e);
                }
            }

            // [Cleanup] Remove notification for cancellations or rejections
            if (status === 'cancelled' || status === 'rejected') {
                try {
                    await pool.execute("DELETE FROM activity_feed WHERE action_type = 'connection_request' AND target_id = ?", [id]);
                } catch (e) {
                    console.error('Failed to cleanup notification:', e);
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