const pool = require('../config/database');

const adminController = {
  // GET /api/admin/disputes
  getDisputes: async (req, res) => {
    try {
      const status = req.query.status || 'disputed';
      const [orders] = await pool.execute(
        `SELECT eo.*,
          buyer.name as buyer_name, buyer.email as buyer_email, buyer.photo_url as buyer_photo,
          vendor.name as vendor_name, vendor.email as vendor_email, vendor.photo_url as vendor_photo
         FROM escrow_orders eo
         JOIN users buyer ON eo.buyer_id = buyer.id
         JOIN users vendor ON eo.vendor_id = vendor.id
         WHERE eo.status = ?
         ORDER BY eo.disputed_at DESC`,
        [status]
      );
      res.json(orders);
    } catch (err) {
      console.error('Admin get disputes error:', err);
      res.status(500).json({ error: 'Failed to fetch disputes' });
    }
  },

  // GET /api/admin/escrow/all
  getAllEscrowOrders: async (req, res) => {
    try {
      const { status, limit = 50, offset = 0 } = req.query;
      let query = `
        SELECT eo.*,
          buyer.name as buyer_name, vendor.name as vendor_name
        FROM escrow_orders eo
        JOIN users buyer ON eo.buyer_id = buyer.id
        JOIN users vendor ON eo.vendor_id = vendor.id
      `;
      const params = [];
      if (status) { query += ' WHERE eo.status = ?'; params.push(status); }
      query += ' ORDER BY eo.created_at DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), parseInt(offset));
      
      const [orders] = await pool.execute(query, params);
      res.json(orders);
    } catch (err) {
      console.error('Admin get all escrow error:', err);
      res.status(500).json({ error: 'Failed to fetch orders' });
    }
  }
};

module.exports = adminController;
