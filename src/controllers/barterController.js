const pool = require('../config/database');
const { validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');

// Multer config for barter item images
const barterStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(process.cwd(), 'uploads')),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'barter-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const barterUpload = multer({
    storage: barterStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|webp/;
        if (filetypes.test(file.mimetype) && filetypes.test(path.extname(file.originalname).toLowerCase())) {
            return cb(null, true);
        }
        cb(new Error('Only images (jpeg, jpg, png, webp) are allowed!'));
    }
}).single('image');

exports.barterUpload = barterUpload;

// ------------------------------------------------------------------
// 0. Get User's Active Loops
// ------------------------------------------------------------------
exports.getMyLoops = async (req, res) => {
    let conn;
    try {
        const user_id = req.user.id;
        conn = await pool.getConnection();

        // Find all loops this user is a part of
        const [userLegs] = await conn.execute(`
            SELECT DISTINCT loop_id FROM trade_transactions WHERE from_user_id = ? OR to_user_id = ?
        `, [user_id, user_id]);

        if (userLegs.length === 0) {
            return res.json([]);
        }

        const loopIds = userLegs.map(l => l.loop_id);
        const placeholders = loopIds.map(() => '?').join(',');

        // Get loop metadata and atomic status
        const [loopsData] = await conn.execute(`
            SELECT * FROM trade_loops WHERE id IN (${placeholders})
        `, loopIds);

        // Reconstruct the matrices
        const [transactions] = await conn.execute(`
            SELECT tt.*, u_from.name as from_name, u_to.name as to_name 
            FROM trade_transactions tt
            JOIN users u_from ON tt.from_user_id = u_from.id
            JOIN users u_to ON tt.to_user_id = u_to.id
            WHERE tt.loop_id IN (${placeholders})
        `, loopIds);

        const structuredLoops = loopsData.map(loop => {
            const legs = transactions.filter(t => t.loop_id === loop.id);
            return {
                loop_id: loop.id,
                status: loop.status,
                loop_trust_avg: loop.loop_trust_avg,
                matrix: legs.map(l => ({
                    id: l.id,
                    from: l.from_name,
                    to: l.to_name,
                    status: l.status,
                    from_user_id: l.from_user_id
                }))
            };
        });

        res.json(structuredLoops);
    } catch (err) {
        console.error('[BarterController] GetLoops Error:', err);
        res.status(500).json({ error: 'Server error retrieving loops.' });
    } finally {
        if (conn) conn.release();
    }
};

// ------------------------------------------------------------------
// 1. Add Barter Item (with optional image)
// ------------------------------------------------------------------
exports.addItem = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { item_name, description, want_category, category } = req.body;
    const user_id = req.user.id;
    const image_url = req.file ? `/uploads/${req.file.filename}` : null;

    let conn;
    try {
        conn = await pool.getConnection();
        const [result] = await conn.execute(`
            INSERT INTO barter_items (user_id, item_name, description, want_category, category, image_url, status)
            VALUES (?, ?, ?, ?, ?, ?, 'available')
        `, [user_id, item_name, description, want_category, category || 'other', image_url]);

        res.status(201).json({
            message: 'Item listed! The Matchmaker will scan for circular trades on its next cycle.',
            item_id: result.insertId,
            image_url: image_url
        });
    } catch (err) {
        console.error('[BarterController] Add Error:', err);
        res.status(500).json({ error: 'Server error adding barter item.' });
    } finally {
        if (conn) conn.release();
    }
};

// ------------------------------------------------------------------
// 1b. Browse All Available Items (Discovery Feed)
// ------------------------------------------------------------------
exports.browseItems = async (req, res) => {
    let conn;
    try {
        conn = await pool.getConnection();
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const category = req.query.category;

        let query = `
            SELECT bi.*, u.name as owner_name, u.photo_url as owner_photo, u.trust_score as owner_trust
            FROM barter_items bi
            JOIN users u ON bi.user_id = u.id
            WHERE bi.status = 'available'
        `;
        const params = [];

        if (category && category !== 'all') {
            query += ' AND bi.category = ?';
            params.push(category);
        }

        query += ` ORDER BY bi.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

        const [items] = await conn.execute(query, params);

        // Get total count for pagination
        let countQuery = 'SELECT COUNT(*) as total FROM barter_items WHERE status = "available"';
        if (category && category !== 'all') {
            countQuery = 'SELECT COUNT(*) as total FROM barter_items WHERE status = "available" AND category = ?';
        }
        const [countResult] = await conn.execute(countQuery, category && category !== 'all' ? [category] : []);

        res.json({
            items,
            pagination: {
                page,
                limit,
                total: countResult[0].total,
                totalPages: Math.ceil(countResult[0].total / limit)
            }
        });
    } catch (err) {
        console.error('[BarterController] Browse Error:', err);
        res.status(500).json({ error: 'Server error browsing items.' });
    } finally {
        if (conn) conn.release();
    }
};

// ------------------------------------------------------------------
// 2. Sign Circular Trade
// ------------------------------------------------------------------
exports.signTrade = async (req, res) => {
    const { loop_id } = req.params;
    const user_id = req.user.id;

    let conn;
    try {
        conn = await pool.getConnection();

        // 1. Verify loop exists and user is part of it
        const [transactions] = await conn.execute(`
            SELECT * FROM trade_transactions
            WHERE loop_id = ?
        `, [loop_id]);

        if (transactions.length === 0) {
            return res.status(404).json({ error: 'Trade loop not found.' });
        }

        const userLeg = transactions.find(t => t.from_user_id === user_id);
        if (!userLeg) {
            return res.status(403).json({ error: 'You are not a participant in this trade.' });
        }

        if (userLeg.status === 'received') {
            return res.status(400).json({ error: 'Already signed.' });
        }

        // 2. Sign it
        await conn.execute(`
            UPDATE trade_transactions 
            SET status = 'shipped' 
            WHERE id = ?
        `, [userLeg.id]);

        // 3. Are all legs signed? If so, upgrade loop to COMMITTED
        const [allLegs] = await conn.execute(`
            SELECT * FROM trade_transactions WHERE loop_id = ?
        `, [loop_id]);

        const allSigned = allLegs.every(leg => leg.status === 'shipped' || leg.status === 'received');
        if (allSigned) {
            await conn.execute(`UPDATE trade_loops SET status = 'committed' WHERE id = ?`, [loop_id]);
        }

        res.json({ message: 'Trade digitally signed successfully.' });

    } catch (err) {
        console.error('[BarterController] Sign Error:', err);
        res.status(500).json({ error: 'Server error signing trade.' });
    } finally {
        if (conn) conn.release();
    }
};

// ------------------------------------------------------------------
// 3. Dispute Trade (Ghosting Scenario Testing)
// ------------------------------------------------------------------
exports.disputeTrade = async (req, res) => {
    const { loop_id } = req.params;
    const reporter_id = req.user.id;
    const { ghosting_user_id } = req.body; // The user they claim ruined the trade

    let conn;
    try {
        conn = await pool.getConnection();
        await conn.beginTransaction();

        // Verify loop
        const [loops] = await conn.execute(`SELECT * FROM trade_loops WHERE id = ?`, [loop_id]);
        if (loops.length === 0) {
            await conn.rollback();
            return res.status(404).json({ error: 'Trade loop not found.' });
        }

        // 1. Freeze the loop
        await conn.execute(`UPDATE trade_loops SET status = 'disputed' WHERE id = ?`, [loop_id]);

        // 2. Penalize the ghosting user (TrustLayer interaction)
        // Hardcoded penalty of 0.5 as requested by the Brainstorm doc test.
        await conn.execute(`
            UPDATE users 
            SET trust_score = GREATEST(0, trust_score - 0.5) 
            WHERE id = ?
        `, [ghosting_user_id]);

        // 3. Release locked items back to safe users
        await conn.execute(`
            UPDATE barter_items bi
            JOIN trade_transactions tt ON tt.item_id = bi.id
            SET bi.status = 'available'
            WHERE tt.loop_id = ? AND tt.from_user_id != ?
        `, [loop_id, ghosting_user_id]);

        await conn.commit();
        res.json({
            message: 'Trade Disputed successfully. The loop is frozen, items returned to safe users, and the offender has been penalized -0.5 points.'
        });

    } catch (err) {
        if (conn) await conn.rollback().catch(() => {});
        console.error('[BarterController] Dispute Error:', err);
        res.status(500).json({ error: 'Server error processing dispute.' });
    } finally {
        if (conn) conn.release();
    }
};
