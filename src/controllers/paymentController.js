const pool = require('../config/database');
const paystack = require('../config/paystack');
const crypto = require('crypto');
const emailService = require('../services/emailService');

const paymentController = {

  // Get or create wallet for a user
  getOrCreateWallet: async (userId) => {
    const [wallets] = await pool.execute('SELECT * FROM wallets WHERE user_id = ?', [userId]);
    if (wallets.length > 0) return wallets[0];

    try {
      await pool.execute('INSERT INTO wallets (user_id) VALUES (?)', [userId]);
    } catch (err) {
      if (err.code !== 'ER_DUP_ENTRY') throw err;
    }
    const [created] = await pool.execute('SELECT * FROM wallets WHERE user_id = ?', [userId]);
    return created[0];
  },

  // GET /payments/wallet — user's wallet balance
  getWallet: async (req, res) => {
    try {
      const userId = req.user.userId || req.user.id;
      const wallet = await paymentController.getOrCreateWallet(userId);

      res.json({
        available_balance: parseFloat(wallet.available_balance),
        escrow_locked: parseFloat(wallet.escrow_locked),
        total: parseFloat(wallet.available_balance) + parseFloat(wallet.escrow_locked),
        currency: wallet.currency
      });
    } catch (err) {
      console.error('Get wallet error:', err);
      res.status(500).json({ error: 'Failed to fetch wallet' });
    }
  },

  // GET /payments/transactions — user's transaction history
  getTransactions: async (req, res) => {
    try {
      const userId = req.user.userId || req.user.id;
      const wallet = await paymentController.getOrCreateWallet(userId);
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const offset = (page - 1) * limit;

      const [transactions] = await pool.execute(
        `SELECT t.*, 
          CASE WHEN t.debit_wallet_id = ? THEN 'debit' ELSE 'credit' END as direction
        FROM transactions t 
        WHERE t.debit_wallet_id = ? OR t.credit_wallet_id = ?
        ORDER BY t.created_at DESC 
        LIMIT ${limit} OFFSET ${offset}`,
        [wallet.id, wallet.id, wallet.id]
      );

      const [countResult] = await pool.execute(
        'SELECT COUNT(*) as total FROM transactions WHERE debit_wallet_id = ? OR credit_wallet_id = ?',
        [wallet.id, wallet.id]
      );

      res.json({
        transactions,
        pagination: {
          page,
          limit,
          total: countResult[0].total,
          pages: Math.ceil(countResult[0].total / limit)
        }
      });
    } catch (err) {
      console.error('Get transactions error:', err);
      res.status(500).json({ error: 'Failed to fetch transactions' });
    }
  },

  // POST /payments/initialize — start a payment for an escrow order
  initializePayment: async (req, res) => {
    try {
      const userId = req.user.userId || req.user.id;
      const { escrow_order_id } = req.body;

      if (!escrow_order_id) {
        return res.status(400).json({ error: 'Escrow order ID is required' });
      }

      // Get escrow order
      const [orders] = await pool.execute(
        'SELECT * FROM escrow_orders WHERE id = ? AND buyer_id = ? AND status = "pending"',
        [escrow_order_id, userId]
      );

      if (orders.length === 0) {
        return res.status(404).json({ error: 'Escrow order not found or already funded' });
      }

      const order = orders[0];
      const reference = `rv_${order.order_ref}_${Date.now()}`;

      // Get user email
      const [users] = await pool.execute('SELECT email FROM users WHERE id = ?', [userId]);
      const email = users[0].email;

      if (paystack.isMockMode()) {
        // MOCK: simulate Paystack response
        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const mockUrl = `${baseUrl}/dashboard/wallet?mock_payment=true&reference=${reference}&order=${escrow_order_id}`;
        
        // Store reference on order
        await pool.execute(
          'UPDATE escrow_orders SET payment_reference = ? WHERE id = ?',
          [reference, escrow_order_id]
        );

        return res.json({
          status: true,
          message: 'Payment initialized (MOCK MODE)',
          data: {
            authorization_url: mockUrl,
            access_code: 'mock_' + reference,
            reference: reference,
            mock_mode: true
          }
        });
      }

      // REAL: Call Paystack
      const result = await paystack.request('POST', '/transaction/initialize', {
        email,
        amount: Math.round(order.amount * 100), // Paystack uses kobo
        reference,
        currency: 'NGN',
        callback_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/wallet?payment_callback=true`,
        metadata: {
          escrow_order_id: order.id,
          order_ref: order.order_ref,
          buyer_id: userId
        }
      });

      if (result.status) {
        await pool.execute(
          'UPDATE escrow_orders SET payment_reference = ? WHERE id = ?',
          [reference, escrow_order_id]
        );
      }

      res.json(result);
    } catch (err) {
      console.error('Initialize payment error:', err);
      res.status(500).json({ error: 'Failed to initialize payment' });
    }
  },

  // POST /payments/topup — fund user wallet directly
  initiateTopUp: async (req, res) => {
    try {
      const userId = req.user.userId || req.user.id;
      const { amount } = req.body;

      if (!amount || amount < 100) {
        return res.status(400).json({ error: 'Minimum top up amount is ₦100' });
      }

      const reference = `ref_topup_amt_${Math.round(parseFloat(amount))}_${Date.now()}_${userId}`;
      const [users] = await pool.execute('SELECT email FROM users WHERE id = ?', [userId]);
      const email = users[0].email;

      if (paystack.isMockMode()) {
        const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        const mockUrl = `${baseUrl}/dashboard/wallet?mock_payment=true&reference=${reference}&topup=true`;
        
        return res.json({
          status: true,
          message: 'Top-up initialized (MOCK MODE)',
          data: {
            authorization_url: mockUrl,
            access_code: 'mock_' + reference,
            reference: reference,
            mock_mode: true
          }
        });
      }

      // REAL: Call Paystack
      const result = await paystack.request('POST', '/transaction/initialize', {
        email,
        amount: Math.round(parseFloat(amount) * 100), 
        reference,
        currency: 'NGN',
        callback_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/wallet?payment_callback=true`,
        metadata: {
          type: 'topup',
          buyer_id: userId
        }
      });

      res.json(result);
    } catch (err) {
      console.error('Initiate top-up error:', err);
      res.status(500).json({ error: 'Failed to initialize top-up' });
    }
  },

  // GET /payments/verify/:reference — verify payment
  verifyPayment: async (req, res) => {
    try {
      const { reference } = req.params;

      if (paystack.isMockMode()) {
        // MOCK: simulate successful payment
        await paymentController.processSuccessfulPayment(reference);
        return res.json({
          status: true,
          message: 'Payment verified (MOCK)',
          data: { status: 'success', reference }
        });
      }

      const result = await paystack.request('GET', `/transaction/verify/${reference}`);
      
      if (result.status && result.data.status === 'success') {
        await paymentController.processSuccessfulPayment(reference);
      }

      res.json(result);
    } catch (err) {
      console.error('Verify payment error:', err);
      res.status(500).json({ error: 'Failed to verify payment' });
    }
  },

  // Process confirmed payment → credit escrow OR wallet
  processSuccessfulPayment: async (reference) => {
    if (reference.startsWith('ref_topup_')) {
      // It's a direct wallet top-up!
      // Format: ref_topup_amt_{amount}_{timestamp}_{userId}
      const parts = reference.split('_');
      const userId = parseInt(parts[parts.length - 1]);
      const wallet = await paymentController.getOrCreateWallet(userId);

      // Verify the transaction wasn't already processed
      const [existing] = await pool.execute('SELECT id FROM transactions WHERE reference = ?', [`dep_${reference}`]);
      if (existing.length > 0) return;

      // Determine the credited amount
      let amount = 0;
      if (paystack.isMockMode()) {
        // In mock mode, parse amount from the reference string or use a fixed test value
        const storedAmount = reference.match(/amt_(\d+)_/);
        amount = storedAmount ? parseInt(storedAmount[1]) : 1000;
      } else {
        // In real mode, always confirm the amount from Paystack
        const verify = await paystack.request('GET', `/transaction/verify/${reference}`);
        if (!verify.status || verify.data.status !== 'success') {
          console.error('Paystack verify failed for top-up:', verify);
          return;
        }
        amount = verify.data.amount / 100; // convert kobo → naira
      }
      
      // Credit wallet
      await pool.execute(
        'UPDATE wallets SET available_balance = available_balance + ? WHERE id = ?',
        [amount, wallet.id]
      );
      
      // Record transaction
      await pool.execute(
        `INSERT INTO transactions (reference, type, amount, credit_wallet_id, description, status)
         VALUES (?, 'deposit', ?, ?, ?, 'completed')`,
        [`dep_${reference}`, amount, wallet.id, `Wallet top-up via Paystack`]
      );
      console.log(`✅ Wallet Funded: User ${userId} — ₦${amount}`);
      return;
    }

    // It's an escrow payment
    const [orders] = await pool.execute
(
      'SELECT * FROM escrow_orders WHERE payment_reference = ? AND status = "pending"',
      [reference]
    );

    if (orders.length === 0) return; // Already processed or not found

    const order = orders[0];

    // Get/create wallets
    const buyerWallet = await paymentController.getOrCreateWallet(order.buyer_id);
    const vendorWallet = await paymentController.getOrCreateWallet(order.vendor_id);

    const txnRef = `txn_escrow_lock_${Date.now()}`;

    // 1. Record deposit into buyer's wallet (from Paystack)
    await pool.execute(
      `INSERT INTO transactions (reference, type, amount, credit_wallet_id, escrow_order_id, description, status)
       VALUES (?, 'deposit', ?, ?, ?, ?, 'completed')`,
      [`dep_${reference}`, order.amount, buyerWallet.id, order.id, `Payment for order ${order.order_ref}`]
    );

    // 2. Lock funds in escrow (debit buyer → escrow)
    await pool.execute(
      `INSERT INTO transactions (reference, type, amount, debit_wallet_id, escrow_order_id, description, status)
       VALUES (?, 'escrow_lock', ?, ?, ?, ?, 'completed')`,
      [txnRef, order.amount, buyerWallet.id, order.id, `Escrow lock for order ${order.order_ref}`]
    );

    // 3. Update buyer wallet: increase escrow_locked
    await pool.execute(
      'UPDATE wallets SET escrow_locked = escrow_locked + ? WHERE id = ?',
      [order.amount, buyerWallet.id]
    );

    // 4. Mark escrow order as funded
    await pool.execute(
      'UPDATE escrow_orders SET status = "funded", funded_at = NOW() WHERE id = ?',
      [order.id]
    );

    // 5. Notify vendor that funds are locked and work can begin
    const [vendorRows] = await pool.execute(
      'SELECT u.name, u.email, buyer.name as buyer_name FROM users u, users buyer WHERE u.id = ? AND buyer.id = ?',
      [order.vendor_id, order.buyer_id]
    );
    if (vendorRows[0]) {
      emailService.sendEscrowNotification(
        vendorRows[0].email, vendorRows[0].name,
        'order_funded',
        {
          title: order.title,
          order_ref: order.order_ref,
          vendor_amount: order.vendor_amount,
          buyer_name: vendorRows[0].buyer_name
        }
      ).catch(() => {}); // non-blocking
    }

    console.log(`✅ Escrow funded: Order ${order.order_ref} — ₦${order.amount}`);
  },

  // POST /payments/webhook — Paystack webhook handler
  handleWebhook: async (req, res) => {
    try {
      // Verify signature
      if (!paystack.isMockMode()) {
        const hash = crypto.createHmac('sha512', paystack.SECRET_KEY)
          .update(JSON.stringify(req.body))
          .digest('hex');
        
        if (hash !== req.headers['x-paystack-signature']) {
          return res.status(401).json({ error: 'Invalid signature' });
        }
      }

      const event = req.body;

      // Log webhook
      await pool.execute(
        'INSERT INTO webhook_events (event_type, reference, payload) VALUES (?, ?, ?)',
        [event.event, event.data?.reference || '', JSON.stringify(event)]
      );

      // Process
      if (event.event === 'charge.success') {
        await paymentController.processSuccessfulPayment(event.data.reference);
      }

      res.status(200).json({ received: true });
    } catch (err) {
      console.error('Webhook error:', err);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  },

  // GET /payments/banks — list Nigerian banks
  getBankList: async (req, res) => {
    try {
      if (paystack.isMockMode()) {
        return res.json({
          status: true,
          data: [
            { name: 'Access Bank', code: '044' },
            { name: 'GTBank', code: '058' },
            { name: 'First Bank', code: '011' },
            { name: 'UBA', code: '033' },
            { name: 'Zenith Bank', code: '057' },
            { name: 'Kuda MFB', code: '50211' },
            { name: 'OPay', code: '999992' },
            { name: 'Palmpay', code: '999991' },
            { name: 'Wema Bank', code: '035' },
            { name: 'Sterling Bank', code: '232' }
          ]
        });
      }

      const result = await paystack.request('GET', '/bank?country=nigeria');
      res.json(result);
    } catch (err) {
      console.error('Get banks error:', err);
      res.status(500).json({ error: 'Failed to fetch bank list' });
    }
  },

  // POST /payments/verify-account — verify bank account name
  verifyAccount: async (req, res) => {
    try {
      const { account_number, bank_code } = req.body;
      if (!account_number || !bank_code) {
        return res.status(400).json({ error: 'Account number and bank code required' });
      }

      if (paystack.isMockMode()) {
        return res.json({
          status: true,
          data: {
            account_number,
            account_name: 'MOCK ACCOUNT HOLDER',
            bank_id: 1
          }
        });
      }

      const result = await paystack.request('GET', 
        `/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`
      );
      res.json(result);
    } catch (err) {
      console.error('Verify account error:', err);
      res.status(500).json({ error: 'Failed to verify account' });
    }
  },

  // POST /payments/payout — vendor requests withdrawal
  requestPayout: async (req, res) => {
    try {
      const userId = req.user.userId || req.user.id;
      const { amount, bank_code, account_number, bank_name } = req.body;

      if (!amount || !bank_code || !account_number) {
        return res.status(400).json({ error: 'Amount, bank code, and account number are required' });
      }

      const wallet = await paymentController.getOrCreateWallet(userId);
      const withdrawAmount = parseFloat(amount);

      if (withdrawAmount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
      }

      if (withdrawAmount > parseFloat(wallet.available_balance)) {
        return res.status(400).json({ 
          error: 'Insufficient balance',
          available: parseFloat(wallet.available_balance)
        });
      }

      // Debit wallet
      await pool.execute(
        'UPDATE wallets SET available_balance = available_balance - ? WHERE id = ? AND available_balance >= ?',
        [withdrawAmount, wallet.id, withdrawAmount]
      );

      const txnRef = `payout_${Date.now()}_${userId}`;

      // Record transaction
      await pool.execute(
        `INSERT INTO transactions (reference, type, amount, debit_wallet_id, description, status)
         VALUES (?, 'withdrawal', ?, ?, ?, 'completed')`,
        [txnRef, withdrawAmount, wallet.id, `Withdrawal to ${bank_name || 'bank'} ****${account_number.slice(-4)}`]
      );

      // Record payout
      const [result] = await pool.execute(
        `INSERT INTO payouts (user_id, wallet_id, amount, bank_code, bank_name, account_number, status, transfer_reference)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [userId, wallet.id, withdrawAmount, bank_code, bank_name || '', account_number, txnRef]
      );

      if (!paystack.isMockMode()) {
        // Create transfer recipient + initiate transfer via Paystack
        const recipient = await paystack.request('POST', '/transferrecipient', {
          type: 'nuban',
          name: req.user.name || 'User',
          account_number,
          bank_code,
          currency: 'NGN'
        });

        if (recipient.status) {
          const transfer = await paystack.request('POST', '/transfer', {
            source: 'balance',
            amount: Math.round(withdrawAmount * 100),
            recipient: recipient.data.recipient_code,
            reason: `RearView payout - ${txnRef}`
          });

          await pool.execute(
            'UPDATE payouts SET transfer_code = ?, status = "processing" WHERE id = ?',
            [transfer.data?.transfer_code || '', result.insertId]
          );
        }
      } else {
        // Mock: mark as completed
        await pool.execute(
          'UPDATE payouts SET status = "completed", completed_at = NOW() WHERE id = ?',
          [result.insertId]
        );
        console.log(`\n--- [MOCK PAYOUT] ---\n₦${withdrawAmount} → ${bank_name} ****${account_number.slice(-4)}\n--------------------\n`);
      }

      res.json({
        message: 'Payout initiated',
        payout_id: result.insertId,
        amount: withdrawAmount,
        mock_mode: paystack.isMockMode()
      });
    } catch (err) {
      console.error('Payout error:', err);
      res.status(500).json({ error: 'Failed to process payout' });
    }
  }
};

module.exports = paymentController;
