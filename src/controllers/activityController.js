const pool = require('../config/database');

const activityController = {
    getFeed: async (req, res) => {
        try {
            const userId = req.user.userId || req.user.id;
            const scope = req.query.scope || 'mixed'; // 'connections', 'global', 'mixed'

            let query = '';
            let params = [];

            if (scope === 'connections') {
                // Return activity ONLY from accepted connections
                query = `
                    SELECT af.*, u.name as actor_name, u.photo_url as actor_avatar, e.name as target_entity_name 
                    FROM activity_feed af
                    JOIN users u ON af.actor_id = u.id
                    LEFT JOIN entities e ON af.target_entity_id = e.id
                    WHERE af.actor_id IN (
                        SELECT connected_user_id FROM connections WHERE user_id = ? AND status = 'accepted'
                        UNION
                        SELECT user_id FROM connections WHERE connected_user_id = ? AND status = 'accepted'
                    )
                    ORDER BY af.created_at DESC
                    LIMIT 50
                `;
                params = [userId, userId];
            } else if (scope === 'global') {
                // Return generic global activity, ignoring connections. Prioritize 'wrote_review'
                query = `
                    SELECT af.*, u.name as actor_name, u.photo_url as actor_avatar, e.name as target_entity_name 
                    FROM activity_feed af
                    JOIN users u ON af.actor_id = u.id
                    LEFT JOIN entities e ON af.target_entity_id = e.id
                    WHERE af.action_type IN ('wrote_review', 'created_post')
                    ORDER BY af.created_at DESC
                    LIMIT 50
                `;
                params = [];
            } else {
                // 'mixed' - Instagram-style: Return connections activity mixed with global trending reviews
                query = `
                    SELECT DISTINCT combined.* FROM (
                        SELECT af.*, u.name as actor_name, u.photo_url as actor_avatar, e.name as target_entity_name 
                        FROM activity_feed af
                        JOIN users u ON af.actor_id = u.id
                        LEFT JOIN entities e ON af.target_entity_id = e.id
                        WHERE af.actor_id IN (
                            SELECT connected_user_id FROM connections WHERE user_id = ? AND status = 'accepted'
                            UNION
                            SELECT user_id FROM connections WHERE connected_user_id = ? AND status = 'accepted'
                        )
                        UNION
                        SELECT af.*, u.name as actor_name, u.photo_url as actor_avatar, e.name as target_entity_name 
                        FROM activity_feed af
                        JOIN users u ON af.actor_id = u.id
                        LEFT JOIN entities e ON af.target_entity_id = e.id
                        WHERE af.action_type = 'wrote_review'
                    ) as combined
                    ORDER BY combined.created_at DESC
                    LIMIT 50
                `;
                params = [userId, userId];
            }

            const [feed] = await pool.execute(query, params);
            res.status(200).json(feed);

        } catch (err) {
            console.error('Error fetching activity feed:', err);
            res.status(500).json({ error: 'Failed to fetch the activity feed' });
        }
    },

    getWarnings: async (req, res) => {
        try {
            // Fetch recent low-rated reviews (1-2 stars) which indicate high-risk entities
            const [warnings] = await pool.execute(`
                SELECT 
                    af.*, 
                    e.name as target_name,
                    e.type as entity_type,
                    e.phone as entity_phone,
                    r.comment,
                    r.is_disputed
                FROM activity_feed af
                JOIN reviews r ON af.target_id = r.id
                JOIN entities e ON af.target_entity_id = e.id
                WHERE r.rating <= 2 OR r.is_disputed = 1
                ORDER BY af.created_at DESC
                LIMIT 5
            `);
            res.status(200).json(warnings);
        } catch (err) {
            console.error('Error fetching warnings:', err);
            res.status(500).json({ error: 'Failed to fetch the warnings feed' });
        }
    }
};

module.exports = activityController;
