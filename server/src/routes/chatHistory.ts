import { Router, Request, Response } from 'express';
import { query } from '../services/db';
import { loadSubscription } from '../middleware/subscriptionGuard';

const router = Router();

router.use(loadSubscription);

/**
 * GET /api/chat/document/:documentId/history
 * Returns chat history for a specific document
 */
router.get('/document/:documentId/history', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { documentId } = req.params;

    const result = await query(
      `SELECT id, role, content, created_at
       FROM document_chats
       WHERE user_id = $1 AND document_id = $2
       ORDER BY created_at ASC`,
      [userId, documentId]
    );

    res.json({ success: true, messages: result.rows });
  } catch (err: any) {
    console.error('❌ Chat history error:', err);
    res.status(500).json({ success: false, error: 'Failed to load chat history' });
  }
});

/**
 * GET /api/chat/global/history
 * Returns global chat history (max 50 messages)
 */
router.get('/global/history', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    const result = await query(
      `SELECT id, role, content, sources, created_at
       FROM global_chats
       WHERE user_id = $1
       ORDER BY created_at ASC
       LIMIT 50`,
      [userId]
    );

    res.json({ success: true, messages: result.rows });
  } catch (err: any) {
    console.error('❌ Global chat history error:', err);
    res.status(500).json({ success: false, error: 'Failed to load global chat history' });
  }
});

export default router;
