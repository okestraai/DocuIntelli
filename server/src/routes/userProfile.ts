import { Router, Request, Response } from 'express';
import { query } from '../services/db';
import { loadSubscription } from '../middleware/subscriptionGuard';

const router = Router();

router.use(loadSubscription);

/**
 * GET /api/user/profile
 * Returns the user's profile (null if not found)
 */
router.get('/profile', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;

    const result = await query(
      `SELECT * FROM user_profiles WHERE id = $1`,
      [userId]
    );

    res.json({ success: true, profile: result.rows[0] || null });
  } catch (err: any) {
    console.error('Profile error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch profile' });
  }
});

/**
 * PUT /api/user/profile
 * Updates user profile + auth_users metadata
 */
router.put('/profile', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const updates = req.body;

    // Update auth_users metadata for display_name, bio, full_name, phone
    if (updates.display_name !== undefined || updates.bio !== undefined ||
        updates.full_name !== undefined || updates.phone !== undefined) {
      const metadataUpdate: Record<string, string | undefined> = {};
      if (updates.display_name !== undefined) metadataUpdate.display_name = updates.display_name;
      if (updates.bio !== undefined) metadataUpdate.bio = updates.bio;
      if (updates.full_name !== undefined) metadataUpdate.full_name = updates.full_name;
      if (updates.phone !== undefined) metadataUpdate.phone = updates.phone;

      try {
        await query(
          `UPDATE auth_users
           SET raw_user_meta_data = raw_user_meta_data || $1::jsonb,
               updated_at = NOW()
           WHERE id = $2`,
          [JSON.stringify(metadataUpdate), userId]
        );
      } catch (authErr) {
        console.error('Auth metadata update error:', authErr);
      }
    }

    // Upsert user_profiles table
    // Build dynamic column list from updates object
    const allowedColumns = [
      'display_name', 'bio', 'full_name', 'date_of_birth', 'phone', 'avatar_url',
      'email_notifications', 'document_reminders',
      'security_alerts', 'billing_alerts', 'document_alerts',
      'engagement_digests', 'life_event_alerts', 'activity_alerts',
      'expo_push_token',
    ];

    const setClauses: string[] = [];
    const values: any[] = [userId]; // $1 = id
    let paramIndex = 2;

    for (const col of allowedColumns) {
      if (updates[col] !== undefined) {
        setClauses.push(`${col} = $${paramIndex}`);
        values.push(updates[col]);
        paramIndex++;
      }
    }

    // Always update updated_at
    setClauses.push(`updated_at = $${paramIndex}`);
    values.push(new Date().toISOString());
    paramIndex++;

    if (setClauses.length > 1) {
      // Try UPDATE first, fall back to INSERT if no row exists
      const updateResult = await query(
        `UPDATE user_profiles SET ${setClauses.join(', ')} WHERE id = $1`,
        values
      );

      if (updateResult.rowCount === 0) {
        // No existing profile — insert
        const insertCols = ['id'];
        const insertPlaceholders = ['$1'];
        const insertValues: any[] = [userId];
        let insertIdx = 2;

        for (const col of allowedColumns) {
          if (updates[col] !== undefined) {
            insertCols.push(col);
            insertPlaceholders.push(`$${insertIdx}`);
            insertValues.push(updates[col]);
            insertIdx++;
          }
        }
        insertCols.push('updated_at');
        insertPlaceholders.push(`$${insertIdx}`);
        insertValues.push(new Date().toISOString());

        await query(
          `INSERT INTO user_profiles (${insertCols.join(', ')}) VALUES (${insertPlaceholders.join(', ')})`,
          insertValues
        );
      }
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('Profile update error:', err);
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

    // Upsert: try UPDATE first, then INSERT
    const updateResult = await query(
      `UPDATE user_profiles SET expo_push_token = $1, updated_at = $2 WHERE id = $3`,
      [token, new Date().toISOString(), userId]
    );

    if (updateResult.rowCount === 0) {
      await query(
        `INSERT INTO user_profiles (id, expo_push_token, updated_at) VALUES ($1, $2, $3)`,
        [userId, token, new Date().toISOString()]
      );
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('Push token error:', err);
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

    await query(
      `UPDATE user_profiles SET expo_push_token = NULL, updated_at = $1 WHERE id = $2`,
      [new Date().toISOString(), userId]
    );

    res.json({ success: true });
  } catch (err: any) {
    console.error('Clear push token error:', err);
    res.status(500).json({ success: false, error: 'Failed to clear push token' });
  }
});

export default router;
