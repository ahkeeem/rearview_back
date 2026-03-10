const pool = require('../config/database');
const reportController = {
    createReport: async (req, res) => {
        try {
            const { reported_id, reason, description } = req.body;
            const reporter_id = req.user.userId || req.user.id;
            
            if (!reported_id || !reason) {
                return res.status(400).json({ error: 'Reported user ID and reason are required' });
            }
            

            const [result] = await pool.execute(
                'INSERT INTO reports (reporter_id, reported_id, reason, description, status) VALUES (?, ?, ?, ?, "pending")',
                [reporter_id, reported_id, reason, description]
            );

            res.status(201).json({
                message: 'Report submitted successfully',
                reportId: result.insertId
            });
        } catch (err) {
            console.error('Error submitting report:', err.message);
            res.status(500).json({ error: 'Failed to submit report' });
        }
    },    
    getReports: async (req, res) => {
        try {
            const [reports] = await pool.execute(`
                SELECT r.*, 
                       u1.name as reporter_name,
                       u2.name as reported_user_name
                FROM reports r
                JOIN users u1 ON r.reporter_id = u1.id
                JOIN users u2 ON r.reported_id = u2.id
                ORDER BY r.created_at DESC
            `);
            
            res.json(reports);
        } catch (err) {
            console.error('Error fetching reports:', err);
            res.status(500).json({ error: 'Failed to fetch reports' });
        }
    },
    updateReportStatus: async (req, res) => {
        try {
            const { id } = req.params;
            const { status } = req.body;
            const admin_id = req.user.userId || req.user.id;

            if (!status || !['pending', 'resolved', 'dismissed'].includes(status)) {
                return res.status(400).json({ error: 'Invalid status. Must be pending, resolved, or dismissed' });
            }

            const [result] = await pool.execute(
                'UPDATE reports SET status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?',
                [status, admin_id, id]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Report not found' });
            }

            // Note: Trust score recalculation should be handled asynchronously
            // or through a separate service/queue system for better performance
            // For now, we'll just update the report status

            res.json({ message: 'Report status updated successfully' });
        } catch (err) {
            console.error('Error updating report:', err);
            res.status(500).json({ error: 'Failed to update report status' });
        }
    },
    getReportsByUser: async (req, res) => {
        try {
            const { userId } = req.params;
            const [reports] = await pool.execute(
                `SELECT r.*, u.name as reporter_name 
                 FROM reports r 
                 JOIN users u ON r.reporter_id = u.id 
                 WHERE r.reported_id = ?`,
                [userId]
            );
            res.json(reports);
        } catch (err) {
            console.error('Error fetching user reports:', err);
            res.status(500).json({ error: 'Failed to fetch reports' });
        }
    }
};

module.exports = reportController;