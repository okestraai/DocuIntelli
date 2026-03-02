/**
 * Admin Authorization Middleware
 *
 * Verifies the authenticated user has role='admin' in their auth_users
 * raw_user_meta_data. Must be placed AFTER loadSubscription in the middleware chain.
 *
 * Admin status is determined by auth_users.raw_user_meta_data->>'role' = 'admin'.
 * This field can only be set via direct database access (service_role / admin CLI).
 */

import { Request, Response, NextFunction } from 'express';
import { query } from '../services/db';
import { cacheGet, cacheSet } from '../services/redisClient';

const ADMIN_CACHE_TTL = 60; // 1 minute — short TTL since admin status rarely changes

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    // Check Redis cache first to avoid hitting the database on every request
    const cacheKey = `admin:${userId}`;
    const cached = await cacheGet<boolean>(cacheKey);

    if (cached === true) {
      next();
      return;
    }

    if (cached === false) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    // Cache miss — verify via auth_users table
    const result = await query(
      'SELECT id, email, raw_user_meta_data FROM auth_users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    const user = result.rows[0];
    const isAdmin = user.raw_user_meta_data?.role === 'admin';
    await cacheSet(cacheKey, isAdmin, ADMIN_CACHE_TTL);

    if (!isAdmin) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    next();
  } catch (err) {
    console.error('Admin check error:', err);
    res.status(500).json({ error: 'Failed to verify admin status' });
  }
}
