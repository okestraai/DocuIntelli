/**
 * Admin Authorization Middleware
 *
 * Verifies the authenticated user has role='admin' in their Supabase
 * app_metadata. Must be placed AFTER loadSubscription in the middleware chain.
 *
 * Admin status is determined by auth.users.app_metadata.role — this field
 * cannot be modified by users themselves (only service_role or Admin API).
 */

import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { cacheGet, cacheSet } from '../services/redisClient';

const ADMIN_CACHE_TTL = 60; // 1 minute — short TTL since admin status rarely changes

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
    // Check Redis cache first to avoid hitting Supabase Admin API on every request
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

    // Cache miss — verify via Supabase Admin API
    const { data: { user }, error } = await supabase.auth.admin.getUserById(userId);

    if (error || !user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    const isAdmin = user.app_metadata?.role === 'admin';
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
