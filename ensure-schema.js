/**
 * ensure-schema.js
 * Runs on every server start. Creates any missing tables using
 * CREATE TABLE IF NOT EXISTS — safe to run against any state.
 */
const pool = require('./src/config/database');

async function ensureSchema() {
    console.log('[Schema] Checking and applying schema...');

    const run = async (sql, label) => {
        try {
            await pool.execute(sql);
            console.log(`[Schema] ✓ ${label}`);
        } catch (err) {
            // Ignore "already exists" errors for ALTER TABLE
            if (err.code === 'ER_DUP_FIELDNAME' || err.code === 'ER_TABLE_EXISTS_ERROR') {
                console.log(`[Schema] ~ ${label} (already exists)`);
            } else {
                console.error(`[Schema] ✗ ${label}:`, err.message);
            }
        }
    };

    // ─── Core Users ──────────────────────────────────────────────────────────
    await run(`
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(100) NOT NULL UNIQUE,
            password VARCHAR(255) NOT NULL,
            phone VARCHAR(20) UNIQUE NULL,
            bio TEXT NULL,
            headline VARCHAR(255) NULL,
            location VARCHAR(255) NULL,
            photo_url VARCHAR(255) NULL,
            banner_url VARCHAR(255) NULL,
            website VARCHAR(255) NULL,
            entity_id VARCHAR(36) NULL,
            role ENUM('user','admin') DEFAULT 'user',
            status ENUM('active','deactivated','pending_deletion','anonymized') DEFAULT 'active',
            verification_level ENUM('none','phone','advanced') DEFAULT 'none',
            trust_score INT DEFAULT 0,
            email_verified BOOLEAN DEFAULT FALSE,
            phone_verified BOOLEAN DEFAULT FALSE,
            nin_verified BOOLEAN DEFAULT FALSE,
            bvn_verified BOOLEAN DEFAULT FALSE,
            is_verified BOOLEAN DEFAULT FALSE,
            deletion_scheduled_at TIMESTAMP NULL DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `, 'users table');

    // ─── OTP Codes ────────────────────────────────────────────────────────────
    await run(`
        CREATE TABLE IF NOT EXISTS otp_codes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            code VARCHAR(6) NOT NULL,
            type ENUM('login','register','verify') NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_otp_user (user_id),
            INDEX idx_otp_code (code)
        )
    `, 'otp_codes table');

    // ─── Login Attempts ───────────────────────────────────────────────────────
    await run(`
        CREATE TABLE IF NOT EXISTS login_attempts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ip_address VARCHAR(45) NOT NULL,
            email VARCHAR(255) NOT NULL,
            attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_la_ip (ip_address),
            INDEX idx_la_email (email)
        )
    `, 'login_attempts table');

    // ─── User Sessions ─────────────────────────────────────────────────────────
    await run(`
        CREATE TABLE IF NOT EXISTS user_sessions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            token TEXT NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_sess_user (user_id)
        )
    `, 'user_sessions table');

    // ─── Activity Logs ─────────────────────────────────────────────────────────
    await run(`
        CREATE TABLE IF NOT EXISTS activity_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            action_type VARCHAR(50) NOT NULL,
            description TEXT NULL,
            ip_address VARCHAR(45) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_al_user (user_id)
        )
    `, 'activity_logs table');

    // ─── Entities ──────────────────────────────────────────────────────────────
    await run(`
        CREATE TABLE IF NOT EXISTS entities (
            id VARCHAR(36) PRIMARY KEY,
            type ENUM('user','business','product') NOT NULL,
            name VARCHAR(255) NOT NULL,
            description TEXT NULL,
            avatar_url VARCHAR(255) NULL,
            claimed_by_user_id INT NULL,
            canonical_id VARCHAR(36) NULL,
            sentiment_score FLOAT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `, 'entities table');

    // ─── Reviews ───────────────────────────────────────────────────────────────
    await run(`
        CREATE TABLE IF NOT EXISTS reviews (
            id INT AUTO_INCREMENT PRIMARY KEY,
            reviewer_id INT NOT NULL,
            reviewee_id INT NULL,
            target_entity_id VARCHAR(36) NULL,
            rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
            comment TEXT NULL,
            interaction_type ENUM('general','transaction','service') DEFAULT 'general',
            proof_url VARCHAR(255) NULL,
            proof_tier ENUM('none','low','high') DEFAULT 'none',
            is_verified BOOLEAN DEFAULT FALSE,
            is_disputed BOOLEAN DEFAULT FALSE,
            dispute_reason TEXT NULL,
            sentiment ENUM('positive','neutral','negative') NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_rev_reviewer (reviewer_id),
            INDEX idx_rev_entity (target_entity_id)
        )
    `, 'reviews table');

    // ─── Review Responses ──────────────────────────────────────────────────────
    await run(`
        CREATE TABLE IF NOT EXISTS review_responses (
            id INT AUTO_INCREMENT PRIMARY KEY,
            review_id INT NOT NULL,
            responder_id INT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `, 'review_responses table');

    // ─── Connections ───────────────────────────────────────────────────────────
    await run(`
        CREATE TABLE IF NOT EXISTS connections (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            connected_user_id INT NOT NULL,
            status ENUM('pending','accepted','declined','blocked') DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_connection (user_id, connected_user_id),
            INDEX idx_conn_user (user_id),
            INDEX idx_conn_target (connected_user_id)
        )
    `, 'connections table');

    // ─── Verifications ─────────────────────────────────────────────────────────
    await run(`
        CREATE TABLE IF NOT EXISTS verifications (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            document_url VARCHAR(255) NOT NULL,
            status ENUM('pending','approved','rejected') DEFAULT 'pending',
            reviewed_by INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `, 'verifications table');

    // ─── Reports ───────────────────────────────────────────────────────────────
    await run(`
        CREATE TABLE IF NOT EXISTS reports (
            id INT AUTO_INCREMENT PRIMARY KEY,
            reporter_id INT NOT NULL,
            reported_id INT NOT NULL,
            reason TEXT NOT NULL,
            description TEXT NULL,
            status ENUM('pending','reviewed','resolved') DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `, 'reports table');

    // ─── Conversations + Messages ───────────────────────────────────────────────
    await run(`
        CREATE TABLE IF NOT EXISTS conversations (
            id INT PRIMARY KEY AUTO_INCREMENT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `, 'conversations table');

    await run(`
        CREATE TABLE IF NOT EXISTS conversation_participants (
            conversation_id INT,
            user_id INT,
            PRIMARY KEY (conversation_id, user_id)
        )
    `, 'conversation_participants table');

    await run(`
        CREATE TABLE IF NOT EXISTS messages (
            id INT PRIMARY KEY AUTO_INCREMENT,
            conversation_id INT NOT NULL,
            sender_id INT NOT NULL,
            content TEXT NOT NULL,
            is_read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_msg_conv (conversation_id)
        )
    `, 'messages table');

    // ─── Activity Feed ─────────────────────────────────────────────────────────
    await run(`
        CREATE TABLE IF NOT EXISTS activity_feed (
            id INT AUTO_INCREMENT PRIMARY KEY,
            actor_id INT NOT NULL,
            action_type ENUM('wrote_review','connected','created_post','disputed_review') NOT NULL,
            target_id VARCHAR(255) NULL,
            target_entity_id VARCHAR(36) NULL,
            action_data JSON NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_af_actor (actor_id)
        )
    `, 'activity_feed table');

    // ─── Threads + Comments ────────────────────────────────────────────────────
    await run(`
        CREATE TABLE IF NOT EXISTS threads (
            id INT AUTO_INCREMENT PRIMARY KEY,
            entity_id VARCHAR(36) NOT NULL,
            title VARCHAR(255) NOT NULL,
            author_id INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `, 'threads table');

    await run(`
        CREATE TABLE IF NOT EXISTS comments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            thread_id INT NOT NULL,
            author_id INT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `, 'comments table');

    // ─── Wallets + Payments ────────────────────────────────────────────────────
    await run(`
        CREATE TABLE IF NOT EXISTS wallets (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL UNIQUE,
            available_balance DECIMAL(15,2) DEFAULT 0.00,
            escrow_locked DECIMAL(15,2) DEFAULT 0.00,
            currency VARCHAR(3) DEFAULT 'NGN',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `, 'wallets table');

    await run(`
        CREATE TABLE IF NOT EXISTS transactions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            reference VARCHAR(255) UNIQUE NOT NULL,
            type ENUM('deposit','withdrawal','escrow_lock','escrow_release','refund') NOT NULL,
            amount DECIMAL(15,2) NOT NULL,
            debit_wallet_id INT NULL,
            credit_wallet_id INT NULL,
            escrow_order_id INT NULL,
            description TEXT NULL,
            status ENUM('pending','completed','failed','reversed') DEFAULT 'completed',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `, 'transactions table');

    await run(`
        CREATE TABLE IF NOT EXISTS escrow_orders (
            id INT AUTO_INCREMENT PRIMARY KEY,
            order_ref VARCHAR(50) UNIQUE NOT NULL,
            buyer_id INT NOT NULL,
            vendor_id INT NOT NULL,
            amount DECIMAL(15,2) NOT NULL,
            description TEXT NOT NULL,
            status ENUM('pending','funded','delivered','completed','disputed','refunded','cancelled') DEFAULT 'pending',
            payment_reference VARCHAR(255) NULL,
            funded_at TIMESTAMP NULL,
            delivered_at TIMESTAMP NULL,
            completed_at TIMESTAMP NULL,
            dispute_reason TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `, 'escrow_orders table');

    await run(`
        CREATE TABLE IF NOT EXISTS payouts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            wallet_id INT NOT NULL,
            amount DECIMAL(15,2) NOT NULL,
            bank_code VARCHAR(10) NOT NULL,
            bank_name VARCHAR(100) NULL,
            account_number VARCHAR(20) NOT NULL,
            transfer_reference VARCHAR(255) NULL,
            transfer_code VARCHAR(255) NULL,
            status ENUM('pending','processing','completed','failed') DEFAULT 'pending',
            completed_at TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `, 'payouts table');

    await run(`
        CREATE TABLE IF NOT EXISTS webhook_events (
            id INT AUTO_INCREMENT PRIMARY KEY,
            event_type VARCHAR(100) NOT NULL,
            reference VARCHAR(255) NULL,
            payload JSON NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `, 'webhook_events table');

    console.log('[Schema] ✅ Schema check complete.');
}

module.exports = ensureSchema;
