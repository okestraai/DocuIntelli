import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import {
  loadSubscription,
  invalidateDeviceCountCache,
  DEVICE_LIMITS,
} from '../middleware/subscriptionGuard';

const router = Router();
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// All routes require auth + subscription
router.use(loadSubscription);

/**
 * GET /api/devices — List user's registered devices
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    const { data: devices, error } = await supabase
      .from('user_devices')
      .select('id, device_id, device_name, platform, last_active_at, created_at, is_blocked')
      .eq('user_id', userId)
      .order('last_active_at', { ascending: false });

    if (error) throw error;

    const plan = req.subscription!.plan;
    const limit = DEVICE_LIMITS[plan] || 1;

    res.json({
      success: true,
      devices: devices || [],
      limit,
      plan,
      current_device_id: req.deviceId || null,
    });
  } catch (err) {
    console.error('List devices error:', err);
    res.status(500).json({ error: 'Failed to list devices' });
  }
});

/**
 * DELETE /api/devices/:id — Remove a device by row ID
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const rowId = req.params.id;

    // Look up the target device
    const { data: targetDevice } = await supabase
      .from('user_devices')
      .select('device_id')
      .eq('id', rowId)
      .eq('user_id', userId)
      .single();

    if (!targetDevice) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    // Prevent removing current device
    if (targetDevice.device_id === req.deviceId) {
      res.status(400).json({ error: 'Cannot remove your current device' });
      return;
    }

    const { error } = await supabase
      .from('user_devices')
      .delete()
      .eq('id', rowId)
      .eq('user_id', userId);

    if (error) throw error;

    // After removal, auto-unblock the most recently active blocked device if under limit
    const plan = req.subscription!.plan;
    const limit = DEVICE_LIMITS[plan] || 1;

    const { count } = await supabase
      .from('user_devices')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_blocked', false);

    if ((count || 0) < limit) {
      const { data: blockedDevices } = await supabase
        .from('user_devices')
        .select('id')
        .eq('user_id', userId)
        .eq('is_blocked', true)
        .order('last_active_at', { ascending: false })
        .limit(1);

      if (blockedDevices && blockedDevices.length > 0) {
        await supabase
          .from('user_devices')
          .update({ is_blocked: false })
          .eq('id', blockedDevices[0].id);
      }
    }

    await invalidateDeviceCountCache(userId);

    res.json({ success: true, message: 'Device removed successfully' });
  } catch (err) {
    console.error('Remove device error:', err);
    res.status(500).json({ error: 'Failed to remove device' });
  }
});

export default router;
