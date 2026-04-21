const pool = require('../config/database');
const paystack = require('../config/paystack');
const paymentController = require('./paymentController');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const emailService = require('../services/emailService');

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
        'UPDATE escrow_orders SET status = "completed", completed_at = NOW() WHERE id = ?',
        [order.id]
      );

      console.log(`✅ Escrow released: ${order.order_ref} — ₦${order.vendor_amount} to vendor`);

      // ── Notify vendor that payment has been released ──
      const [vendorRows] = await pool.execute('SELECT name, email FROM users WHERE id = ?', [order.vendor_id]);
      if (vendorRows[0]) {
        emailService.sendEscrowNotification(
          vendorRows[0].email, vendorRows[0].name,
          'delivery_confirmed',
          { title: order.title, order_ref: order.order_ref, vendor_amount: order.vendor_amount }
        ).catch(() => {}); // non-blocking
      }

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

      // Auto-log initial reason as the first dispute message
      await pool.execute(
        'INSERT INTO dispute_messages (escrow_order_id, sender_id, message) VALUES (?, ?, ?)',
        [id, userId, `[INITIAL DISPUTE REASON] ${reason}`]
      );

      // ── Notify BOTH parties that dispute has been opened ──
      const order = orders[0];
      const [parties] = await pool.execute(
        'SELECT u.name, u.email FROM users u WHERE u.id IN (?, ?)',
        [order.buyer_id, order.vendor_id]
      );
      const notifData = { title: order.title, order_ref: order.order_ref, dispute_reason: reason };
      parties.forEach(p => {
        emailService.sendEscrowNotification(p.email, p.name, 'dispute_opened', notifData).catch(() => {});
      });

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

      // ── Notify both parties of resolution (non-blocking, after response sent) ──
      const [parties] = await pool.execute(
        'SELECT u.name, u.email FROM users u WHERE u.id IN (?, ?)',
        [order.buyer_id, order.vendor_id]
      );
      parties.forEach(p => {
        emailService.sendEscrowNotification(p.email, p.name, 'dispute_resolved', {
          order_ref: order.order_ref,
          resolution
        }).catch(() => {});
      });
    } catch (err) {
      console.error('Resolve dispute error:', err);
      res.status(500).json({ error: 'Failed to resolve dispute' });
    }
  },

  // POST /escrow/pay-link/:slug — Public/Guest checkout for Trust Links
  payTrustLink: async (req, res) => {
    try {
      const { slug } = req.params;
      const { guest_email, guest_name } = req.body;

      if (!guest_email || !guest_name) {
        return res.status(400).json({ error: 'Email and name are required' });
      }

      // 1. Verify Trust Link
      const [links] = await pool.execute(
        'SELECT * FROM trust_links WHERE url_slug = ? AND is_active = 1',
        [slug]
      );

      if (links.length === 0) {
        return res.status(404).json({ error: 'Trust link not found or inactive' });
      }

      const link = links[0];
      const parsedAmount = parseFloat(link.amount);

      // 2. Resolve or Create Buyer Account
      let buyerId;
      const [existingUsers] = await pool.execute('SELECT id FROM users WHERE email = ?', [guest_email]);

      if (existingUsers.length > 0) {
        buyerId = existingUsers[0].id;
      } else {
        // Auto-register guest
        const randomPassword = crypto.randomBytes(8).toString('hex');
        const hashedPassword = await bcrypt.hash(randomPassword, 10);
        
        const [insertRes] = await pool.execute(
          `INSERT INTO users (name, email, password, role, verification_level) 
           VALUES (?, ?, ?, 'user', 'none')`,
          [guest_name, guest_email, hashedPassword]
        );
        buyerId = insertRes.insertId;

        // Optionally, an email could be sent here with their temporary password
      }

      // 3. Create Escrow Order
      const commissionRate = paystack.COMMISSION_RATE;
      const commissionAmount = Math.round(parsedAmount * commissionRate * 100) / 100;
      const vendorAmount = parsedAmount - commissionAmount;
      const orderRef = \`ESC-\${Date.now().toString(36).toUpperCase()}-\${crypto.randomBytes(3).toString('hex').toUpperCase()}\`;

      const [orderRes] = await pool.execute(
        `INSERT INTO escrow_orders (order_ref, buyer_id, vendor_id, amount, commission_rate, commission_amount, vendor_amount, title, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderRef, buyerId, link.vendor_id, parsedAmount, commissionRate, commissionAmount, vendorAmount, link.title, 'Created via Trust Link: ' + slug]
      );
      
      const escrowOrderId = orderRes.insertId;
      const reference = \`ref_escrow_\${orderRef}_\${Date.now()}\`;

      // 4. Initialize Paystack (Similar to paymentController logic)
      let authorizationUrl;

      if (paystack.isMockMode()) {
        const baseUrl = process.env.FRONTEND_URL || req.headers.origin || process.env.CORS_ORIGIN || 'http://localhost:3000';
        authorizationUrl = \`\${baseUrl}/public/checkout-success?mock_payment=true&reference=\${reference}&order=\${escrowOrderId}\`;
        
        await pool.execute('UPDATE escrow_orders SET payment_reference = ? WHERE id = ?', [reference, escrowOrderId]);
      } else {
        const baseUrl = process.env.FRONTEND_URL || req.headers.origin || process.env.CORS_ORIGIN;
        const result = await paystack.request('POST', '/transaction/initialize', {
          email: guest_email,
          amount: Math.round(parsedAmount * 100),
          reference,
          currency: 'NGN',
          callback_url: \`\${baseUrl}/public/checkout-success?payment_callback=true\`,
          metadata: {
            escrow_order_id: escrowOrderId,
            order_ref: orderRef,
            buyer_id: buyerId
          }
        });

        if (result.status) {
          await pool.execute('UPDATE escrow_orders SET payment_reference = ? WHERE id = ?', [reference, escrowOrderId]);
          authorizationUrl = result.data.authorization_url;
        } else {
          return res.status(500).json({ error: 'Failed to initialize payment gateway' });
        }
      }

      res.status(200).json({
        message: 'Checkout initialized',
        authorization_url: authorizationUrl,
        reference: reference
      });

    } catch (err) {
      console.error('Trust Link checkout error:', err);
      res.status(500).json({ error: 'Failed to process checkout' });
    }
  },

  // PUT /escrow/orders/:id/deliver — Vendor marks order as delivered (Minimal Logistics)
  markDelivered: async (req, res) => {
    try {
      const vendorId = req.user.userId || req.user.id;
      const { id } = req.params;

      const [orders] = await pool.execute(
        'SELECT * FROM escrow_orders WHERE id = ? AND vendor_id = ? AND status = "funded"',
        [id, vendorId]
      );

      if (orders.length === 0) {
        return res.status(404).json({ error: 'Funded escrow order not found or you are not the vendor' });
      }

      const order = orders[0];

      await pool.execute(
        'UPDATE escrow_orders SET status = "delivered", delivered_at = NOW() WHERE id = ?',
        [order.id]
      );

      // Notify buyer that it's delivered and prompt them to confirm via email link
      const [buyerRows] = await pool.execute('SELECT name, email FROM users WHERE id = ?', [order.buyer_id]);
      if (buyerRows[0]) {
        emailService.sendEscrowNotification(
          buyerRows[0].email, buyerRows[0].name,
          'item_delivered_prompt',
          { title: order.title, order_ref: order.order_ref, amount: order.amount }
        ).catch(() => {});
      }

      res.json({ message: 'Order marked as delivered. Buyer has been notified to release funds.' });
    } catch (err) {
      console.error('Mark delivered error:', err);
      res.status(500).json({ error: 'Failed to mark as delivered' });
    }
  },

  // GET /escrow/orders/:id/messages — Fetch dispute messages
  getDisputeMessages: async (req, res) => {
    try {
      const userId = req.user.userId || req.user.id;
      const isAdmin = req.user.role === 'admin';
      const { id } = req.params;

      // Verify access to order
      let query = 'SELECT * FROM escrow_orders WHERE id = ?';
      let params = [id];
      if (!isAdmin) {
        query += ' AND (buyer_id = ? OR vendor_id = ?)';
        params.push(userId, userId);
      }

      const [orders] = await pool.execute(query, params);
      if (orders.length === 0) {
        return res.status(403).json({ error: 'Not authorized or order not found' });
      }

      const [messages] = await pool.execute(
        `SELECT dm.*, u.name as sender_name, u.role as sender_role, u.photo_url as sender_photo 
         FROM dispute_messages dm
         JOIN users u ON dm.sender_id = u.id
         WHERE dm.escrow_order_id = ?
         ORDER BY dm.created_at ASC`,
        [id]
      );

      res.json(messages);
    } catch (err) {
      console.error('Get dispute messages error:', err);
      res.status(500).json({ error: 'Failed to load messages' });
    }
  },

  // POST /escrow/orders/:id/messages — Add a message/evidence to dispute
  addDisputeMessage: async (req, res) => {
    try {
      const userId = req.user.userId || req.user.id;
      const isAdmin = req.user.role === 'admin';
      const { id } = req.params;
      const { message, attachment_url } = req.body;

      if (!message && !attachment_url) {
        return res.status(400).json({ error: 'Message or attachment required' });
      }

      // Verify access to order
      let query = 'SELECT * FROM escrow_orders WHERE id = ?';
      let params = [id];
      if (!isAdmin) {
        query += ' AND (buyer_id = ? OR vendor_id = ?)';
        params.push(userId, userId);
      }

      const [orders] = await pool.execute(query, params);
      if (orders.length === 0) {
        return res.status(403).json({ error: 'Not authorized or order not found' });
      }

      if (orders[0].status !== 'disputed') {
        return res.status(400).json({ error: 'Order is not in a disputed state' });
      }

      const [insertRes] = await pool.execute(
        'INSERT INTO dispute_messages (escrow_order_id, sender_id, message, attachment_url) VALUES (?, ?, ?, ?)',
        [id, userId, message || null, attachment_url || null]
      );
      
      const [newMsg] = await pool.execute(
        `SELECT dm.*, u.name as sender_name, u.role as sender_role, u.photo_url as sender_photo 
         FROM dispute_messages dm
         JOIN users u ON dm.sender_id = u.id
         WHERE dm.id = ?`,
        [insertRes.insertId]
      );

      res.status(201).json(newMsg[0]);
    } catch (err) {
      console.error('Add dispute message error:', err);
      res.status(500).json({ error: 'Failed to post message' });
    }
  }
};

module.exports = escrowController;
