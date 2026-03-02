/**
 * Client Error Logging Route
 *
 * POST /api/errors/log — Log client-side errors for admin troubleshooting.
 * Stores in usage_logs with feature='client_error', visible in Admin Activity.
 */

import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { loadSubscription } from '../middleware/subscriptionGuard';

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Require auth so we know which user hit the error
router.use(loadSubscription);

router.post('/log', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const { feature, error: errorMessage, context } = req.body;

    if (!feature || !errorMessage) {
      res.status(400).json({ success: false, error: 'feature and error are required' });
      return;
    }

    await supabase.from('usage_logs').insert({
      user_id: userId,
      feature: `client_error:${String(feature).slice(0, 50)}`,
      metadata: {
        error: String(errorMessage).slice(0, 2000),
        context: context ? JSON.parse(JSON.stringify(context)) : undefined,
        user_agent: req.headers['user-agent']?.slice(0, 500),
        timestamp: new Date().toISOString(),
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Error logging client error:', err);
    res.status(500).json({ success: false });
  }
});

export default router;
