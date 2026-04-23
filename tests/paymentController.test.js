const paymentController = require('../src/controllers/paymentController');
const pool = require('../src/config/database');
const emailService = require('../src/services/emailService');

// Mock external dependencies
jest.mock('../src/config/database', () => ({
  execute: jest.fn(),
  getConnection: jest.fn()
}));
jest.mock('../src/services/emailService', () => ({
  sendEscrowNotification: jest.fn().mockResolvedValue(true)
}));

describe('Payment Controller', () => {
  let mockConn;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock connection for transactions
    mockConn = {
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      execute: jest.fn(),
      release: jest.fn()
    };
    pool.getConnection.mockResolvedValue(mockConn);
  });

  describe('processSuccessfulPayment', () => {
    it('should correctly process a wallet top-up within a transaction', async () => {
      const reference = 'ref_topup_amt_5000_123456_2';
      
      // Mock existing check (no duplicate)
      pool.execute.mockResolvedValueOnce([[]]);
      
      // Mock getOrCreateWallet
      pool.execute.mockResolvedValueOnce([[{ id: 10, user_id: 2, available_balance: '0' }]]);

      // Mock mock-mode paystack (it will parse '5000' from ref)
      
      // The transaction commands
      mockConn.execute.mockResolvedValue([{}]);

      await paymentController.processSuccessfulPayment(reference);

      // Verify transaction was used
      expect(pool.getConnection).toHaveBeenCalled();
      expect(mockConn.beginTransaction).toHaveBeenCalled();
      
      // Credit wallet
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE wallets SET available_balance = available_balance + ?'),
        [5000, 10]
      );
      
      // Record transaction
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO transactions'),
        expect.arrayContaining([`dep_${reference}`, 5000, 10])
      );

      expect(mockConn.commit).toHaveBeenCalled();
      expect(mockConn.release).toHaveBeenCalled();
      expect(mockConn.rollback).not.toHaveBeenCalled();
    });

    it('should rollback transaction if top-up db query fails', async () => {
      const reference = 'ref_topup_amt_5000_123456_2';
      
      pool.execute.mockResolvedValueOnce([[]]); // not duplicate
      pool.execute.mockResolvedValueOnce([[{ id: 10, user_id: 2, available_balance: '0' }]]); // wallet
      
      const dbError = new Error('DB Error');
      mockConn.execute.mockRejectedValueOnce(dbError);

      await expect(paymentController.processSuccessfulPayment(reference)).rejects.toThrow('DB Error');

      expect(mockConn.beginTransaction).toHaveBeenCalled();
      expect(mockConn.rollback).toHaveBeenCalled();
      expect(mockConn.commit).not.toHaveBeenCalled();
      expect(mockConn.release).toHaveBeenCalled();
    });

    it('should correctly process an escrow payment within a transaction', async () => {
      const reference = 'ref_escrow_123';
      
      // Not a topup prefix
      // Mock order check
      pool.execute.mockResolvedValueOnce([[{ 
        id: 5, 
        order_ref: 'ORD-123',
        buyer_id: 2, 
        vendor_id: 3,
        amount: '15000.00',
        vendor_amount: '14625.00',
        title: 'Logo Design'
      }]]);

      // Mock wallets
      pool.execute.mockResolvedValueOnce([[{ id: 10, user_id: 2 }]]); // buyer
      pool.execute.mockResolvedValueOnce([[{ id: 11, user_id: 3 }]]); // vendor

      mockConn.execute.mockResolvedValue([{}]);

      // Mock vendor email details query
      pool.execute.mockResolvedValueOnce([[{ name: 'Vendor', email: 'v@test.com', buyer_name: 'Buyer' }]]);

      await paymentController.processSuccessfulPayment(reference);

      // Verify transaction usage
      expect(mockConn.beginTransaction).toHaveBeenCalled();

      // 1. Record deposit
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO transactions'),
        expect.arrayContaining([`dep_${reference}`, '15000.00', 10, 5])
      );

      // 2. Lock funds in escrow
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO transactions'),
        expect.arrayContaining([expect.stringContaining('txn_escrow_lock'), '15000.00', 10, 5])
      );

      // 3. Update buyer wallet escrow_locked
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE wallets SET escrow_locked = escrow_locked + ?'),
        ['15000.00', 10]
      );

      // 4. Mark order as funded
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE escrow_orders SET status = "funded"'),
        [5]
      );

      expect(mockConn.commit).toHaveBeenCalled();

      // Ensure notification sent
      expect(emailService.sendEscrowNotification).toHaveBeenCalledWith(
        'v@test.com', 'Vendor', 'order_funded',
        expect.objectContaining({ order_ref: 'ORD-123' })
      );
    });
  });

  describe('requestPayout', () => {
    it('should handle race condition dynamically by checking affectedRows', async () => {
      const req = {
        user: { id: 2 },
        body: { amount: 5000, bank_code: '058', account_number: '1234567890', bank_name: 'GTB' }
      };
      
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Mock wallet (shows enough balance)
      pool.execute.mockResolvedValueOnce([[{ id: 10, user_id: 2, available_balance: '10000.00' }]]);

      // Simulate the race condition: by the time this query runs, balance is gone!
      mockConn.execute.mockResolvedValueOnce([{ affectedRows: 0 }]);

      await paymentController.requestPayout(req, res);

      expect(mockConn.beginTransaction).toHaveBeenCalled();
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE wallets SET available_balance = available_balance - ? WHERE id = ? AND available_balance >='),
        [5000, 10, 5000]
      );
      
      expect(mockConn.rollback).toHaveBeenCalled();
      expect(mockConn.commit).not.toHaveBeenCalled();
      
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.stringContaining('concurrent withdrawal')
      }));
    });
  });
});
