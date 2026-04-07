const pool = require('../config/database');
const paystack = require('../config/paystack');
const paymentController = require('./paymentController');
const crypto = require('crypto');

const escrowController = {

  // POST /escrow/orders — create escrow order
  createOrder: async (req, res) => {
    try {
      const buyerId = req.user.userId || req.user.id;
      const { vendor_id, amount, title, description } = req.body;

      if (!vendor_id || !amount || !title) {
        return res.status(400).json({ error: 'Vendor ID, amount, and title are required' });
      }

      if (parseInt(vendor_id) === buyerId) {
        return res.status(400).json({ error: 'Cannot create an escrow order with yourself' });
      }

      const parsedAmount = parseFloat(amount);
      if (parsedAmount < 100) {
        return res.status(400).json({ error: 'Minimum escrow amount is ₦100' });
      }

      // Verify vendor exists
      const [vendors] = await pool.execute('SELECT id, name FROM users WHERE id = ?', [vendor_id]);
      if (vendors.length === 0) {
        return res.status(404).json({ error: 'Vendor not found' });
      }

      // Calculate commission
      const commissionRate = paystack.COMMISSION_RATE;
      const commissionAmount = Math.round(parsedAmount * commissionRate * 100) / 100;
      const vendorAmount = parsedAmount - commissionAmount;

      // Generate unique order reference
      const orderRef = `ESC-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

      const [result] = await pool.execute(
        `INSERT INTO escrow_orders (order_ref, buyer_id, vendor_id, amount, commission_rate, commission_amount, vendor_amount, title, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderRef, buyerId, vendor_id, parsedAmount, commissionRate, commissionAmount, vendorAmount, title, description || '']
      );

      res.status(201).json({
        message: 'Escrow order created',
        order: {
          id: result.insertId,
          order_ref: orderRef,
          amount: parsedAmount,
          commission: commissionAmount,
          vendor_receives: vendorAmount,
          status: 'pending',
          vendor: vendors[0].name
        }
      });
    } catch (err) {
      console.error('Create escrow order error:', err);
      res.status(500).json({ error: 'Failed to create escrow order' });
    }
  },

  // GET /escrow/orders — user's orders (as buyer + vendor)
  getOrders: async (req, res) => {
    try {
      const userId = req.user.userId || req.user.id;
      const status = req.query.status;
      const role = req.query.role; // 'buyer' or 'vendor'

      let query = `
        SELECT eo.*, 
          buyer.name as buyer_name, buyer.photo_url as buyer_photo,
          vendor.name as vendor_name, vendor.photo_url as vendor_photo
        FROM escrow_orders eo
        JOIN users buyer ON eo.buyer_id = buyer.id
        JOIN users vendor ON eo.vendor_id = vendor.id
        WHERE (eo.buyer_id = ? OR eo.vendor_id = ?)
      `;
      const params = [userId, userId];

      if (role === 'buyer') {
        query = query.replace('(eo.buyer_id = ? OR eo.vendor_id = ?)', 'eo.buyer_id = ?');
        params.splice(1, 1); // Remove second userId
      } else if (role === 'vendor') {
        query = query.replace('(eo.buyer_id = ? OR eo.vendor_id = ?)', 'eo.vendor_id = ?');
        params.splice(0, 1); // Remove first userId
      }

      if (status) {
        query += ' AND eo.status = ?';
        params.push(status);
      }

      query += ' ORDER BY eo.created_at DESC';

      const [orders] = await pool.execute(query, params);

      // Add role info
      const enriched = orders.map(o => ({
        ...o,
        my_role: o.buyer_id === userId ? 'buyer' : 'vendor',
        amount: parseFloat(o.amount),
        commission_amount: parseFloat(o.commission_amount),
        vendor_amount: parseFloat(o.vendor_amount)
      }));

      res.json(enriched);
    } catch (err) {
      console.error('Get escrow orders error:', err);
      res.status(500).json({ error: 'Failed to fetch orders' });
    }
  },

  // GET /escrow/orders/:id — order detail
  getOrderDetail: async (req, res) => {
    try {
      const userId = req.user.userId || req.user.id;
      const { id } = req.params;

      const [orders] = await pool.execute(
        `SELECT eo.*, 
          buyer.name as buyer_name, buyer.photo_url as buyer_photo, buyer.email as buyer_email,
          vendor.name as vendor_name, vendor.photo_url as vendor_photo, vendor.email as vendor_email
        FROM escrow_orders eo
        JOIN users buyer ON eo.buyer_id = buyer.id
        JOIN users vendor ON eo.vendor_id = vendor.id
        WHERE eo.id = ? AND (eo.buyer_id = ? OR eo.vendor_id = ?)`,
        [id, userId, userId]
      );

      if (orders.length === 0) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const order = orders[0];

      // Get related transactions
      const [transactions] = await pool.execute(
        'SELECT * FROM transactions WHERE escrow_order_id = ? ORDER BY created_at ASC',
        [id]
      );

      res.json({
        ...order,
        my_role: order.buyer_id === userId ? 'buyer' : 'vendor',
        amount: parseFloat(order.amount),
        commission_amount: parseFloat(order.commission_amount),
        vendor_amount: parseFloat(order.vendor_amount),
        transactions
      });
    } catch (err) {
      console.error('Get order detail error:', err);
      res.status(500).json({ error: 'Failed to fetch order' });
    }
  },

  // PUT /escrow/orders/:id/confirm — buyer confirms delivery → release funds
  confirmDelivery: async (req, res) => {
    try {
      const userId = req.user.userId || req.user.id;
      const { id } = req.params;

      const [orders] = await pool.execute(
        'SELECT * FROM escrow_orders WHERE id = ? AND buyer_id = ? AND status = "funded"',
        [id, userId]
      );

      if (orders.length === 0) {
        return res.status(404).json({ error: 'funded escrow order not found or you are not the buyer' });
      }

      const order = orders[0];

      // Get wallets
      const buyerWallet = await paymentController.getOrCreateWallet(order.buyer_id);
      const vendorWallet = await paymentController.getOrCreateWallet(order.vendor_id);

      // 1. Release escrow: deduct from buyer's escrow_locked
      await pool.execute(
        'UPDATE wallets SET escrow_locked = escrow_locked - ? WHERE id = ?',
        [order.amount, buyerWallet.id]
      );

      // 2. Credit vendor wallet with vendor_amount
      await pool.execute(
        'UPDATE wallets SET available_balance = available_balance + ? WHERE id = ?',
        [order.vendor_amount, vendorWallet.id]
      );

      // 3. Record release transaction
      await pool.execute(
        `INSERT INTO transactions (reference, type, amount, debit_wallet_id, credit_wallet_id, escrow_order_id, description, status)
         VALUES (?, 'escrow_release', ?, ?, ?, ?, ?, 'completed')`,
        [`release_${order.order_ref}_${Date.now()}`, order.vendor_amount, buyerWallet.id, vendorWallet.id, order.id,
         `Escrow release for order ${order.order_ref}`]
      );

      // 4. Record commission
      if (order.commission_amount > 0) {
        // Platform wallet = user 1's wallet
        const [platformWallets] = await pool.execute('SELECT id FROM wallets WHERE user_id = 1');
        if (platformWallets.length > 0) {
          await pool.execute(
            'UPDATE wallets SET available_balance = available_balance + ? WHERE id = ?',
            [order.commission_amount, platformWallets[0].id]
          );
          await pool.execute(
            `INSERT INTO transactions (reference, type, amount, credit_wallet_id, escrow_order_id, description, status)
             VALUES (?, 'commission', ?, ?, ?, ?, 'completed')`,
            [`comm_${order.order_ref}`, order.commission_amount, platformWallets[0].id, order.id,
             `Commission from order ${order.order_ref}`]
          );
        }
      }

      // 5. Update order status
      await pool.execute(
        'UPDATE escrow_orders SET status = "released", released_at = NOW() WHERE id = ?',
        [order.id]
      );

      console.log(`✅ Escrow released: ${order.order_ref} — ₦${order.vendor_amount} to vendor`);

      res.json({
        message: 'Delivery confirmed. Funds released to vendor.',
        vendor_received: parseFloat(order.vendor_amount),
        commission: parseFloat(order.commission_amount)
      });
    } catch (err) {
      console.error('Confirm delivery error:', err);
      res.status(500).json({ error: 'Failed to confirm delivery' });
    }
  },

  // PUT /escrow/orders/:id/dispute — dispute an order
  disputeOrder: async (req, res) => {
    try {
      const userId = req.user.userId || req.user.id;
      const { id } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({ error: 'Dispute reason is required' });
      }

      const [orders] = await pool.execute(
        'SELECT * FROM escrow_orders WHERE id = ? AND (buyer_id = ? OR vendor_id = ?) AND status = "funded"',
        [id, userId, userId]
      );

      if (orders.length === 0) {
        return res.status(404).json({ error: 'Funded order not found or you are not a party to this order' });
      }

      await pool.execute(
        'UPDATE escrow_orders SET status = "disputed", dispute_reason = ?, disputed_at = NOW() WHERE id = ?',
        [reason, id]
      );

      res.json({ message: 'Order disputed. Funds remain locked until resolved.' });
    } catch (err) {
      console.error('Dispute escrow error:', err);
      res.status(500).json({ error: 'Failed to dispute order' });
    }
  },

  // PUT /escrow/orders/:id/resolve — admin resolves dispute
  resolveDispute: async (req, res) => {
    try {
      const adminId = req.user.userId || req.user.id;
      const { id } = req.params;
      const { resolution } = req.body; // 'release' or 'refund'

      if (!resolution || !['release', 'refund'].includes(resolution)) {
        return res.status(400).json({ error: 'Resolution must be "release" or "refund"' });
      }

      const [orders] = await pool.execute(
        'SELECT * FROM escrow_orders WHERE id = ? AND status = "disputed"',
        [id]
      );

      if (orders.length === 0) {
        return res.status(404).json({ error: 'Disputed order not found' });
      }

      const order = orders[0];
      const buyerWallet = await paymentController.getOrCreateWallet(order.buyer_id);
      const vendorWallet = await paymentController.getOrCreateWallet(order.vendor_id);

      if (resolution === 'release') {
        // Release to vendor (same as confirm)
        await pool.execute('UPDATE wallets SET escrow_locked = escrow_locked - ? WHERE id = ?', [order.amount, buyerWallet.id]);
        await pool.execute('UPDATE wallets SET available_balance = available_balance + ? WHERE id = ?', [order.vendor_amount, vendorWallet.id]);
        
        await pool.execute(
          `INSERT INTO transactions (reference, type, amount, debit_wallet_id, credit_wallet_id, escrow_order_id, description, status)
           VALUES (?, 'escrow_release', ?, ?, ?, ?, ?, 'completed')`,
          [`resolve_release_${order.order_ref}`, order.vendor_amount, buyerWallet.id, vendorWallet.id, order.id,
           `Dispute resolved: released to vendor`]
        );

        await pool.execute(
          'UPDATE escrow_orders SET status = "released", dispute_resolved_by = ?, resolved_at = NOW() WHERE id = ?',
          [adminId, id]
        );
      } else {
        // Refund to buyer
        await pool.execute('UPDATE wallets SET escrow_locked = escrow_locked - ?, available_balance = available_balance + ? WHERE id = ?',
          [order.amount, order.amount, buyerWallet.id]);
        
        await pool.execute(
          `INSERT INTO transactions (reference, type, amount, credit_wallet_id, escrow_order_id, description, status)
           VALUES (?, 'escrow_refund', ?, ?, ?, ?, 'completed')`,
          [`resolve_refund_${order.order_ref}`, order.amount, buyerWallet.id, order.id,
           `Dispute resolved: refunded to buyer`]
        );

        await pool.execute(
          'UPDATE escrow_orders SET status = "refunded", dispute_resolved_by = ?, resolved_at = NOW() WHERE id = ?',
          [adminId, id]
        );
      }

      res.json({ message: `Dispute resolved: ${resolution === 'release' ? 'funds released to vendor' : 'funds refunded to buyer'}` });
    } catch (err) {
      console.error('Resolve dispute error:', err);
      res.status(500).json({ error: 'Failed to resolve dispute' });
    }
  }
};

module.exports = escrowController;
