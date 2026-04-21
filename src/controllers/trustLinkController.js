const pool = require('../config/database');
const crypto = require('crypto');

const trustLinkController = {
  // POST /api/trust-links -> Create a new trust link
  createLink: async (req, res) => {
    try {
      const vendorId = req.user.userId || req.user.id;
      const { title, description, amount } = req.body;

      if (!title || !amount || amount < 100) {
        return res.status(400).json({ error: 'Title and an amount of at least ₦100 are required' });
      }

      // Generate a short, unique 8-character url slug (e.g., rv.co/pay/A1B2C3D4)
      const urlSlug = crypto.randomBytes(4).toString('hex').toLowerCase();

      const [result] = await pool.execute(
        `INSERT INTO trust_links (vendor_id, title, description, amount, url_slug)
         VALUES (?, ?, ?, ?, ?)`,
        [vendorId, title, description || '', amount, urlSlug]
      );

      res.status(201).json({
        message: 'Trust link created',
        link: {
          id: result.insertId,
          url_slug: urlSlug,
          title,
          amount
        }
      });
    } catch (err) {
      console.error('Create trust link error:', err);
      res.status(500).json({ error: 'Failed to create trust link' });
    }
  },

  // GET /api/trust-links -> List vendor's links
  getMyLinks: async (req, res) => {
    try {
      const vendorId = req.user.userId || req.user.id;

      const [links] = await pool.execute(
        'SELECT * FROM trust_links WHERE vendor_id = ? ORDER BY created_at DESC',
        [vendorId]
      );

      res.json(links);
    } catch (err) {
      console.error('Get trust links error:', err);
      res.status(500).json({ error: 'Failed to fetch trust links' });
    }
  },

  // PUT /api/trust-links/:id/toggle -> Toggle active status
  toggleLinkStatus: async (req, res) => {
    try {
      const vendorId = req.user.userId || req.user.id;
      const { id } = req.params;
      const { is_active } = req.body;

      await pool.execute(
        'UPDATE trust_links SET is_active = ? WHERE id = ? AND vendor_id = ?',
        [is_active ? 1 : 0, id, vendorId]
      );

      res.json({ message: 'Trust link status updated' });
    } catch (err) {
      console.error('Toggle trust link error:', err);
      res.status(500).json({ error: 'Failed to toggle trust link' });
    }
  },

  // GET /api/trust-links/public/:slug -> Public endpoint for checking out
  getPublicLink: async (req, res) => {
    try {
      const { slug } = req.params;

      const [links] = await pool.execute(
        `SELECT tl.*, 
          v.name as vendor_name, v.photo_url as vendor_photo, 
          v.trust_score, v.verification_level, v.created_at as vendor_joined
         FROM trust_links tl
         JOIN users v ON tl.vendor_id = v.id
         WHERE tl.url_slug = ? AND tl.is_active = 1`,
        [slug]
      );

      if (links.length === 0) {
        return res.status(404).json({ error: 'Trust link not found or inactive' });
      }

      const link = links[0];
      
      res.json({
        id: link.id,
        title: link.title,
        description: link.description,
        amount: parseFloat(link.amount),
        vendor: {
          id: link.vendor_id,
          name: link.vendor_name,
          photo_url: link.vendor_photo,
          trust_score: link.trust_score,
          verification_level: link.verification_level,
          joined: link.vendor_joined
        }
      });
    } catch (err) {
      console.error('Get public link error:', err);
      res.status(500).json({ error: 'Failed to fetch public link details' });
    }
  }
};

module.exports = trustLinkController;
