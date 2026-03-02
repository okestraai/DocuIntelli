/**
 * DocuIntelli AI — Dunning Routes
 *
 * GET  /api/dunning/status   — Current dunning state for the authenticated user
 * POST /api/dunning/run      — Manual trigger for dunning escalation (admin/cron)
 */

import { Router, Request, Response } from 'express';
import { loadSubscription } from '../middleware/subscriptionGuard';
import { getDunningStatus, runDunningEscalation } from '../services/dunningService';

const router = Router();

/**
 * GET /status — Returns the user's dunning state
 * Used by the frontend to show the DunningBanner.
 */
router.get('/status', loadSubscription, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const status = await getDunningStatus(userId);
    res.json({ success: true, ...status });
  } catch (err: any) {
    console.error('Dunning status error:', err);
    res.status(500).json({ success: false, error: 'Failed to get dunning status' });
  }
});

/**
 * POST /run — Trigger dunning escalation manually
 * Protected by a simple shared secret (CRON_SECRET env var).
 * The cron-tasks edge function calls this, or it can be triggered manually for testing.
 */
router.post('/run', async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const result = await runDunningEscalation();
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('Dunning run error:', err);
    res.status(500).json({ success: false, error: 'Failed to run dunning escalation' });
  }
});

export default router;
