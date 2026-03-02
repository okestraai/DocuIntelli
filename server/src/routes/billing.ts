import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { loadSubscription } from '../middleware/subscriptionGuard';

const router = Router();

router.use(loadSubscription);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase configuration in billing routes');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * GET /api/billing/data
 * Returns payment methods, invoices, and transactions for the authenticated user
 */
router.get('/data', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    const [pmResult, invResult, txResult] = await Promise.all([
      supabase
        .from('payment_methods')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('is_default', { ascending: false }),
      supabase
        .from('invoices')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    if (pmResult.error) console.error('⚠️ Payment methods query error:', pmResult.error);
    if (invResult.error) console.error('⚠️ Invoices query error:', invResult.error);
    if (txResult.error) console.error('⚠️ Transactions query error:', txResult.error);

    res.json({
      success: true,
      paymentMethods: pmResult.data || [],
      invoices: invResult.data || [],
      transactions: txResult.data || [],
    });
  } catch (err: any) {
    console.error('❌ Billing data error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch billing data' });
  }
});

export default router;
