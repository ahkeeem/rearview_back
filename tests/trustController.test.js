const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/config/database');

// Mock pool to avoid touching DB during unit tests
jest.mock('../src/config/database', () => ({
  execute: jest.fn(),
  getConnection: jest.fn()
}));

// Mock authentication middleware
jest.mock('../src/middlewares/authMiddleware', () => ({
  verifyToken: (req, res, next) => {
    req.user = { userId: 1, role: 'user' };
    next();
  }
}));

describe('Trust Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/trust/:id', () => {
    it('should correctly calculate the 4-dimensional trust score', async () => {
      const targetUserId = 2;

      // Mock users table for target user (Verification)
      // Verification weight: phone(50) -> 0.5 * 25 = 12.5
      pool.execute.mockResolvedValueOnce([[{
        id: targetUserId,
        verification_level: 'phone',
        nin_verified: 0,
        bvn_verified: 0
      }]]);

      // Mock reviews table (Reviews 45%)
      // Review 1: from verified user (phone), score=80. Weight: (1 + 0.8) = 1.8 * proof_tier(1) * 1 = 1.8. value: 5 * 1.8 = 9
      // Review 2: from unverified user, score=20. Weight: (0.5 + 0.2) = 0.7 * proof_tier(1) * 1 = 0.7. value: 3 * 0.7 = 2.1
      // Total weighted sum: 11.1 / 2.5 = 4.44 (out of 5). 4.44 * 20 * 0.45 = 39.96
      pool.execute.mockResolvedValueOnce([[{
        rating: 5,
        is_disputed: 0,
        proof_tier: 'none',
        reviewer_verification: 'phone',
        reviewer_trust: 80
      }, {
        rating: 3,
        is_disputed: 0,
        proof_tier: 'none',
        reviewer_verification: 'none',
        reviewer_trust: 20
      }]]);

      // Mock escrow_orders (Escrow 15%)
      // 2 completed, 1 disputed.
      // Base: 50. + (2*5) - (1*15) = 50 + 10 - 15 = 45. 45 * 0.15 = 6.75
      pool.execute.mockResolvedValueOnce([[{
        status: 'completed', count: 2
      }, {
        status: 'disputed', count: 1
      }]]);

      // Mock connections (Connections 15%)
      // 2 connections -> 20. 20 * 0.15 = 3.0
      pool.execute.mockResolvedValueOnce([[{
        count: 2
      }]]);

      // Final expected calculation:
      // ReviewScore (45% max): ~39.96
      // VerificationScore (25% max): 12.5
      // EscrowScore (15% max): 6.75
      // ConnectionScore (15% max): 3.0
      // Total: ~62.21

      // Expecting update on user's trust score
      pool.execute.mockResolvedValueOnce([]);

      const response = await request(app).get(`/api/trust/${targetUserId}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('trust_score');
      // The exact value might be slightly different due to rounding in controller
      expect(response.body.trust_score).toBeGreaterThan(61);
      expect(response.body.trust_score).toBeLessThan(63);
      expect(response.body.components).toHaveProperty('reviewScore');
      expect(response.body.components).toHaveProperty('verificationScore');
      expect(response.body.components).toHaveProperty('escrowScore');
      expect(response.body.components).toHaveProperty('connectionScore');
    });

    it('should cap connection score at 100 before weighting', async () => {
      const targetUserId = 2;

      pool.execute.mockResolvedValueOnce([[{
        id: targetUserId,
        verification_level: 'none',
        nin_verified: 0,
        bvn_verified: 0
      }]]); // Verification

      pool.execute.mockResolvedValueOnce([[]]); // Reviews
      pool.execute.mockResolvedValueOnce([[]]); // Escrow

      // 15 connections -> normally 150, but capped at 100.
      pool.execute.mockResolvedValueOnce([[{
        count: 15
      }]]);

      pool.execute.mockResolvedValueOnce([]); // Update DB

      const response = await request(app).get(`/api/trust/${targetUserId}`);

      expect(response.status).toBe(200);
      
      // Expected: Reviews=0, Verification=0, Escrow=7.5 (baseline 50 * 0.15), Connections=15 (100 * 0.15)
      // Total: 22.5
      expect(response.body.components.connectionScore).toBe(15);
      expect(response.body.trust_score).toBe(22.5);
    });
  });
});
