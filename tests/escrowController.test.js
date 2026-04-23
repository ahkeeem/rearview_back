const escrowController = require('../src/controllers/escrowController');
const pool = require('../src/config/database');
const paymentController = require('../src/controllers/paymentController');

// Mock external dependencies
jest.mock('../src/config/database', () => ({
  execute: jest.fn(),
  getConnection: jest.fn()
}));

jest.mock('../src/controllers/paymentController', () => ({
  getOrCreateWallet: jest.fn()
}));

describe('Escrow Controller', () => {
  let mockConn;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockConn = {
      beginTransaction: jest.fn(),
      commit: jest.fn(),
      rollback: jest.fn(),
      execute: jest.fn(),
      release: jest.fn()
    };
    pool.getConnection.mockResolvedValue(mockConn);
  });

  describe('confirmDelivery', () => {
    it('should securely release escrow funds to vendor within a transaction', async () => {
      const req = {
        user: { id: 2 },
        params: { id: 5 }
      };
      
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Mock order check
      pool.execute.mockResolvedValueOnce([[{ 
        id: 5, 
        order_ref: 'ORD-123',
        buyer_id: 2, 
        vendor_id: 3,
        amount: '10000.00',
        vendor_amount: '9750.00',
        commission_amount: '250.00'
      }]]);

      // Mock wallets
      paymentController.getOrCreateWallet
        .mockResolvedValueOnce({ id: 10, user_id: 2 }) // buyer
        .mockResolvedValueOnce({ id: 11, user_id: 3 }); // vendor

      // Mock platform wallet for commission
      mockConn.execute.mockResolvedValue([[{ id: 1 }]]);

      // Execute controller
      await escrowController.confirmDelivery(req, res);

      // Verify transaction usage
      expect(mockConn.beginTransaction).toHaveBeenCalled();

      // 1. Release escrow from buyer
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE wallets SET escrow_locked = escrow_locked - ?'),
        ['10000.00', 10]
      );

      // 2. Credit vendor
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE wallets SET available_balance = available_balance + ?'),
        ['9750.00', 11]
      );

      // 3. Record commission
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE wallets SET available_balance = available_balance + ?'),
        ['250.00', 1] // platform wallet id
      );

      // 4. Update order status
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE escrow_orders SET status = "completed"'),
        [5]
      );

      expect(mockConn.commit).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('Delivery confirmed')
      }));
    });
  });

  describe('resolveDispute', () => {
    it('should refund buyer and update order status within a transaction', async () => {
      const req = {
        admin: { id: 99 },
        params: { id: 5 },
        body: { resolution: 'refund' }
      };
      
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      // Mock order
      pool.execute.mockResolvedValueOnce([[{ 
        id: 5, 
        order_ref: 'ORD-123',
        buyer_id: 2, 
        vendor_id: 3,
        amount: '10000.00',
        vendor_amount: '9750.00'
      }]]);

      // Mock wallets
      paymentController.getOrCreateWallet
        .mockResolvedValueOnce({ id: 10 }) // buyer
        .mockResolvedValueOnce({ id: 11 }); // vendor

      await escrowController.resolveDispute(req, res);

      expect(mockConn.beginTransaction).toHaveBeenCalled();

      // Refund to buyer: remove from escrow_locked, add to available_balance
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE wallets SET escrow_locked = escrow_locked - ?, available_balance = available_balance + ?'),
        ['10000.00', '10000.00', 10]
      );

      // Record transaction
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO transactions'),
        expect.arrayContaining([expect.stringContaining('resolve_refund'), '10000.00', 10, 5])
      );

      // Update status
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE escrow_orders SET status = "refunded", dispute_resolved_by = ?'),
        [99, 5]
      );

      expect(mockConn.commit).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('refunded to buyer')
      }));
    });
  });
});
