const pool = require('../config/database');
const reportController = {
    createReport: async (req, res) => {
        try {
            console.log('Request body:', req.body);
            const { reported_id, reason, description } = req.body;
            const reporter_id = req.user.userId;
            
            console.log('Extracted values:', {
                reporter_id,
                reported_id,
                reason, 
                description
            });

            const [result] = await pool.execute(
                'INSERT INTO reports (reporter_id, reported_id, reason, description, status) VALUES (?, ?, ?, ?, "pending")',
                [reporter_id, reported_id, reason, description]
            );

            res.status(201).json({
                message: 'Report submitted successfully',
                reportId: result.insertId
            });
        } catch (err) {
            console.error('Request body:', req.body);
            console.error('Values causing error:', err.message);
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
            const admin_id = req.user.id;

            const [result] = await pool.execute(
                'UPDATE reports SET status = ? WHERE id = ?',
                [status, id]
            );

            // If report is resolved as valid, update trust score
            if (status === 'resolved') {
                const [report] = await pool.execute(
                    'SELECT reported_id FROM reports WHERE id = ?',
                    [id]
                );
                // Trigger trust score recalculation
                await updateUserTrustScore(report[0].reported_id);
            }

            res.json({ message: 'Report status updated successfully' });
        } catch (err) {
            console.error('Error updating report:', err);
            res.status(500).json({ error: 'Failed to update report' });
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