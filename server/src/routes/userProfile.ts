import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { loadSubscription } from '../middleware/subscriptionGuard';

const router = Router();

router.use(loadSubscription);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase configuration in user profile routes');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * GET /api/user/profile
 * Returns the user's profile (null if not found)
 */
router.get('/profile', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('❌ Get profile error:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch profile' });
      return;
    }

    res.json({ success: true, profile: data || null });
  } catch (err: any) {
    console.error('❌ Profile error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch profile' });
  }
});

/**
 * PUT /api/user/profile
 * Updates user profile + auth metadata
 */
router.put('/profile', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const updates = req.body;

    // Update auth metadata for display_name, bio, full_name, phone
    if (updates.display_name !== undefined || updates.bio !== undefined ||
        updates.full_name !== undefined || updates.phone !== undefined) {
      const metadataUpdate: Record<string, string | undefined> = {};
      if (updates.display_name !== undefined) metadataUpdate.display_name = updates.display_name;
      if (updates.bio !== undefined) metadataUpdate.bio = updates.bio;
      if (updates.full_name !== undefined) metadataUpdate.full_name = updates.full_name;
      if (updates.phone !== undefined) metadataUpdate.phone = updates.phone;

      const { error: authError } = await supabase.auth.admin.updateUserById(userId, {
        user_metadata: metadataUpdate,
      });

      if (authError) {
        console.error('⚠️ Auth metadata update error:', authError);
      }
    }

    // Upsert user_profiles table
    const { error: profileError } = await supabase
      .from('user_profiles')
      .upsert({
        id: userId,
        ...updates,
        updated_at: new Date().toISOString(),
      });

    if (profileError) {
      console.error('❌ Profile upsert error:', profileError);
      res.status(500).json({ success: false, error: 'Failed to update profile' });
      return;
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('❌ Profile update error:', err);
    res.status(500).json({ success: false, error: 'Failed to update profile' });
  }
});

/**
 * POST /api/user/push-token
 * Register an Expo push token
 */
router.post('/push-token', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { token } = req.body;

    if (!token) {
      res.status(400).json({ success: false, error: 'Token is required' });
      return;
    }

    const { error } = await supabase
      .from('user_profiles')
      .upsert({
        id: userId,
        expo_push_token: token,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error('❌ Push token upsert error:', error);
      res.status(500).json({ success: false, error: 'Failed to save push token' });
      return;
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('❌ Push token error:', err);
    res.status(500).json({ success: false, error: 'Failed to save push token' });
  }
});

/**
 * DELETE /api/user/push-token
 * Clear the push token (on logout)
 */
router.delete('/push-token', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    const { error } = await supabase
      .from('user_profiles')
      .update({
        expo_push_token: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      console.error('❌ Clear push token error:', error);
      res.status(500).json({ success: false, error: 'Failed to clear push token' });
      return;
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('❌ Clear push token error:', err);
    res.status(500).json({ success: false, error: 'Failed to clear push token' });
  }
});

export default router;
