import { Router, Request, Response } from 'express';
import { query } from '../services/db';
import { loadSubscription } from '../middleware/subscriptionGuard';

const router = Router();

router.use(loadSubscription);

/**
 * GET /api/billing/data
 * Returns payment methods, invoices, and transactions for the authenticated user
 */
router.get('/data', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    const [pmResult, invResult, txResult] = await Promise.all([
      query(
        `SELECT * FROM payment_methods
         WHERE user_id = $1 AND deleted_at IS NULL
         ORDER BY is_default DESC`,
        [userId]
      ),
      query(
        `SELECT * FROM invoices
         WHERE user_id = $1 AND deleted_at IS NULL
         ORDER BY created_at DESC
         LIMIT 10`,
        [userId]
      ),
      query(
        `SELECT * FROM transactions
         WHERE user_id = $1 AND deleted_at IS NULL
         ORDER BY created_at DESC
         LIMIT 20`,
        [userId]
      ),
    ]);

    res.json({
      success: true,
      paymentMethods: pmResult.rows,
      invoices: invResult.rows,
      transactions: txResult.rows,
    });
  } catch (err: any) {
    console.error('❌ Billing data error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch billing data' });
  }
});

export default router;
