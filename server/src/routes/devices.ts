import { Router, Request, Response } from 'express';
import { query } from '../services/db';
import {
  loadSubscription,
  invalidateDeviceCountCache,
  DEVICE_LIMITS,
} from '../middleware/subscriptionGuard';

const router = Router();

// All routes require auth + subscription
router.use(loadSubscription);

/**
 * GET /api/devices — List user's registered devices
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    const result = await query(
      `SELECT id, device_id, device_name, platform, last_active_at, created_at, is_blocked
       FROM user_devices
       WHERE user_id = $1
       ORDER BY last_active_at DESC`,
      [userId]
    );

    const plan = req.subscription!.plan;
    const limit = DEVICE_LIMITS[plan] || 1;

    res.json({
      success: true,
      devices: result.rows,
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
    const targetResult = await query(
      `SELECT device_id FROM user_devices WHERE id = $1 AND user_id = $2`,
      [rowId, userId]
    );

    const targetDevice = targetResult.rows[0];
    if (!targetDevice) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }

    // Prevent removing current device
    if (targetDevice.device_id === req.deviceId) {
      res.status(400).json({ error: 'Cannot remove your current device' });
      return;
    }

    await query(
      `DELETE FROM user_devices WHERE id = $1 AND user_id = $2`,
      [rowId, userId]
    );

    // After removal, auto-unblock the most recently active blocked device if under limit
    const plan = req.subscription!.plan;
    const limit = DEVICE_LIMITS[plan] || 1;

    const countResult = await query(
      `SELECT COUNT(*) as count FROM user_devices WHERE user_id = $1 AND is_blocked = false`,
      [userId]
    );
    const activeCount = parseInt(countResult.rows[0]?.count || '0', 10);

    if (activeCount < limit) {
      const blockedResult = await query(
        `SELECT id FROM user_devices
         WHERE user_id = $1 AND is_blocked = true
         ORDER BY last_active_at DESC
         LIMIT 1`,
        [userId]
      );

      if (blockedResult.rows.length > 0) {
        await query(
          `UPDATE user_devices SET is_blocked = false WHERE id = $1`,
          [blockedResult.rows[0].id]
        );
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
