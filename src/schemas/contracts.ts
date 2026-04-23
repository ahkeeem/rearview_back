import { z } from 'zod';

export const EscrowOrderSchema = z.object({
  buyer_id: z.number().int().positive(),
  vendor_id: z.number().int().positive(),
  title: z.string().min(3).max(100),
  description: z.string().optional(),
  amount: z.number().positive(),
  commission_amount: z.number().min(0),
  vendor_amount: z.number().positive()
});

export const TrustReviewSchema = z.object({
  target_user_id: z.number().int().positive(),
  rating: z.number().min(1).max(5),
  content: z.string().min(5).max(500),
  proof_url: z.string().url().optional().nullable()
});

export const PaymentInitializationSchema = z.object({
  amount: z.number().positive(),
  email: z.string().email(),
  metadata: z.object({
    type: z.enum(['topup', 'escrow']),
    user_id: z.number().int().positive(),
    order_id: z.number().int().positive().optional()
  }).optional()
});

export type EscrowOrder = z.infer<typeof EscrowOrderSchema>;
export type TrustReview = z.infer<typeof TrustReviewSchema>;
export type PaymentInitialization = z.infer<typeof PaymentInitializationSchema>;
