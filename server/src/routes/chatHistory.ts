import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { loadSubscription } from '../middleware/subscriptionGuard';

const router = Router();

router.use(loadSubscription);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase configuration in chat history routes');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * GET /api/chat/document/:documentId/history
 * Returns chat history for a specific document
 */
router.get('/document/:documentId/history', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { documentId } = req.params;

    const { data, error } = await supabase
      .from('document_chats')
      .select('id, role, content, created_at')
      .eq('user_id', userId)
      .eq('document_id', documentId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('❌ Document chat history error:', error);
      res.status(500).json({ success: false, error: 'Failed to load chat history' });
      return;
    }

    res.json({ success: true, messages: data || [] });
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

    const { data, error } = await supabase
      .from('global_chats')
      .select('id, role, content, sources, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) {
      console.error('❌ Global chat history error:', error);
      res.status(500).json({ success: false, error: 'Failed to load global chat history' });
      return;
    }

    res.json({ success: true, messages: data || [] });
  } catch (err: any) {
    console.error('❌ Global chat history error:', err);
    res.status(500).json({ success: false, error: 'Failed to load global chat history' });
  }
});

export default router;
