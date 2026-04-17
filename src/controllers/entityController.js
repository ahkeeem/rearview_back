const pool = require('../config/database');

const entityController = {
    // Search entities generically (products, people, businesses)
    searchEntities: async (req, res) => {
        try {
            const searchTerm = req.query.q;
            const type = req.query.type; 
            
            if (!searchTerm) {
                return res.status(400).json({ error: 'Search term is required' });
            }

            // Universal Identity Search (Names + Multi-Identifiers)
            let query = `
                SELECT DISTINCT e.id, e.type, e.name, e.description, e.avatar_url, e.sentiment_score, e.phone
                FROM entities e
                LEFT JOIN entity_identifiers ei ON e.id = ei.entity_id
                WHERE (e.name LIKE ? OR e.phone = ? OR ei.identifier_value = ?)
                ORDER BY e.name ASC LIMIT 20
            `;
            const params = [`%${searchTerm}%`, searchTerm, searchTerm];
            
            const [entities] = await pool.execute(query, params);
            res.json(entities);
        } catch (err) {
            console.error('Error searching entities:', err);
            res.status(500).json({ error: 'Failed to search entities' });
        }
    },

    // Frictionless Entity Registration (Deduplication Logic)
    createEntity: async (req, res) => {
        try {
            const { name, type, description, phone, email } = req.body;
            
            if (!name || !type) {
                return res.status(400).json({ error: 'Entity name and type are required' });
            }

            // 1. Check for Existing Entity (Multi-Identifier Match)
            // Check entities table and identifiers table
            const [existingIdent] = await pool.execute(
                'SELECT entity_id FROM entity_identifiers WHERE identifier_value IN (?, ?)',
                [phone || 'N/A', email || 'N/A']
            );

            if (existingIdent.length > 0) {
                const [ent] = await pool.execute('SELECT * FROM entities WHERE id = ?', [existingIdent[0].entity_id]);
                return res.status(200).json({ message: 'Entity already exists (Matched ID)', entity: ent[0] });
            }

            // 2. Register New Entity
            const crypto = require('crypto');
            const entityId = crypto.randomUUID();

            await pool.execute(
                "INSERT INTO entities (id, type, name, description, phone) VALUES (?, ?, ?, ?, ?)",
                [entityId, type, name, description || null, phone || null]
            );

            // 3. Register Identifiers
            if (phone) {
                await pool.execute(
                    "INSERT INTO entity_identifiers (entity_id, identifier_type, identifier_value) VALUES (?, 'phone', ?)",
                    [entityId, phone]
                );
            }
            if (email) {
                await pool.execute(
                    "INSERT INTO entity_identifiers (entity_id, identifier_type, identifier_value) VALUES (?, 'email', ?)",
                    [entityId, email]
                );
            }

            res.status(201).json({
                message: 'Entity created successfully',
                entity: { id: entityId, name, type, phone }
            });
        } catch (err) {
            console.error('Error auto-generating entity:', err);
            res.status(500).json({ error: 'Failed to create entity' });
        }
    },

    getSuggestions: async (req, res) => {
        try {
            const userId = req.user.userId || req.user.id;

            // Logic: 
            // 1. Entities (Product/Business) reviewed by connections with rating >= 4
            // 2. Exclude entities already reviewed by the user
            // 3. Order by number of positive contact reviews
            const query = `
                SELECT e.*, COUNT(r.id) as connection_review_count
                FROM entities e
                JOIN reviews r ON e.id = r.target_entity_id
                WHERE e.type IN ('product', 'business')
                AND r.rating >= 4
                AND r.reviewer_id IN (
                    SELECT connected_user_id FROM connections WHERE user_id = ? AND status = 'accepted'
                    UNION
                    SELECT user_id FROM connections WHERE connected_user_id = ? AND status = 'accepted'
                )
                AND e.id NOT IN (
                    SELECT target_entity_id FROM reviews WHERE reviewer_id = ?
                )
                GROUP BY e.id
                ORDER BY connection_review_count DESC, e.sentiment_score DESC
                LIMIT 5
            `;

            const [suggestions] = await pool.execute(query, [userId, userId, userId]);

            // Fallback: Global trending if network data is low
            if (suggestions.length < 3) {
                const globalQuery = `
                    SELECT * FROM entities 
                    WHERE type IN ('product', 'business')
                    AND id NOT IN (SELECT target_entity_id FROM reviews WHERE reviewer_id = ?)
                    ORDER BY sentiment_score DESC
                    LIMIT ?
                `;
                const limitValue = Math.max(0, 5 - suggestions.length);
                const [globalSuggestions] = await pool.execute(globalQuery, [userId, limitValue]);
                res.json([...suggestions, ...globalSuggestions]);
            } else {
                res.json(suggestions);
            }

        } catch (err) {
            console.error('Error fetching entity suggestions:', err);
            res.status(500).json({ error: 'Failed to generate trust-based suggestions' });
        }
    }
};

module.exports = entityController;
