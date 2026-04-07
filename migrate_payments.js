const pool = require('./src/config/database');

async function migratePayments() {
  console.log('🏗️  Creating payment/escrow tables...\n');

  // 1. Wallets — one per user
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS wallets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      available_balance DECIMAL(15,2) DEFAULT 0.00,
      escrow_locked DECIMAL(15,2) DEFAULT 0.00,
      currency VARCHAR(3) DEFAULT 'NGN',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  console.log('✓ wallets');

  // 2. Transactions — immutable double-entry ledger
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      reference VARCHAR(100) UNIQUE NOT NULL,
      type ENUM('deposit','escrow_lock','escrow_release','escrow_refund','withdrawal','commission') NOT NULL,
      amount DECIMAL(15,2) NOT NULL,
      currency VARCHAR(3) DEFAULT 'NGN',
      debit_wallet_id INT,
      credit_wallet_id INT,
      escrow_order_id INT,
      description TEXT,
      status ENUM('pending','completed','failed','reversed') DEFAULT 'pending',
      payment_reference VARCHAR(100),
      metadata JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (debit_wallet_id) REFERENCES wallets(id),
      FOREIGN KEY (credit_wallet_id) REFERENCES wallets(id),
      INDEX idx_txn_reference (reference),
      INDEX idx_txn_type (type),
      INDEX idx_txn_status (status)
    )
  `);
  console.log('✓ transactions');

  // 3. Escrow orders — the core
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS escrow_orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_ref VARCHAR(50) UNIQUE NOT NULL,
      buyer_id INT NOT NULL,
      vendor_id INT NOT NULL,
      amount DECIMAL(15,2) NOT NULL,
      commission_rate DECIMAL(5,4) DEFAULT 0.0250,
      commission_amount DECIMAL(15,2) DEFAULT 0.00,
      vendor_amount DECIMAL(15,2) DEFAULT 0.00,
      currency VARCHAR(3) DEFAULT 'NGN',
      title VARCHAR(255) NOT NULL,
      description TEXT,
      status ENUM('pending','funded','delivered','released','disputed','refunded','cancelled') DEFAULT 'pending',
      payment_reference VARCHAR(100),
      delivery_proof_url TEXT,
      dispute_reason TEXT,
      dispute_resolved_by INT,
      funded_at TIMESTAMP NULL,
      delivered_at TIMESTAMP NULL,
      released_at TIMESTAMP NULL,
      disputed_at TIMESTAMP NULL,
      resolved_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (buyer_id) REFERENCES users(id),
      FOREIGN KEY (vendor_id) REFERENCES users(id),
      INDEX idx_escrow_buyer (buyer_id),
      INDEX idx_escrow_vendor (vendor_id),
      INDEX idx_escrow_status (status)
    )
  `);
  console.log('✓ escrow_orders');

  // 4. Payouts — vendor withdrawals
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS payouts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      wallet_id INT NOT NULL,
      amount DECIMAL(15,2) NOT NULL,
      currency VARCHAR(3) DEFAULT 'NGN',
      bank_code VARCHAR(10),
      bank_name VARCHAR(100),
      account_number VARCHAR(20),
      account_name VARCHAR(200),
      status ENUM('pending','processing','completed','failed') DEFAULT 'pending',
      transfer_reference VARCHAR(100),
      transfer_code VARCHAR(100),
      failure_reason TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (wallet_id) REFERENCES wallets(id),
      INDEX idx_payout_user (user_id),
      INDEX idx_payout_status (status)
    )
  `);
  console.log('✓ payouts');

  // 5. Webhook events — raw log for debugging
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS webhook_events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      provider VARCHAR(50) DEFAULT 'paystack',
      event_type VARCHAR(100),
      reference VARCHAR(100),
      payload JSON,
      processed BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_webhook_ref (reference),
      INDEX idx_webhook_event (event_type)
    )
  `);
  console.log('✓ webhook_events');

  // 6. Create platform wallet (user_id = 0 workaround — use admin user)
  // Check if a platform wallet exists
  const [existing] = await pool.execute('SELECT id FROM wallets WHERE user_id = 1');
  if (existing.length === 0) {
    await pool.execute('INSERT INTO wallets (user_id) VALUES (1)');
    console.log('✓ platform wallet created (user 1)');
  }

  console.log('\n✅ Payment schema migration complete!');
  process.exit(0);
}

migratePayments().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
