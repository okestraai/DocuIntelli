/**
 * Admin Routes
 *
 * All endpoints require authentication (loadSubscription) + admin role (requireAdmin).
 * Provides dashboard metrics, user management, impersonation, activity monitoring,
 * and system health endpoints.
 */

import { Router, Request, Response } from 'express';
import { loadSubscription } from '../middleware/subscriptionGuard';
import { requireAdmin } from '../middleware/requireAdmin';
import { cacheGet, cacheSet, cacheDel } from '../services/redisClient';
import { generateImpersonationProof } from '../middleware/impersonation';
import { generateAccessToken, generateRefreshToken } from '../services/authService';
import { query } from '../services/db';

const router = Router();

const DASHBOARD_CACHE_TTL = 60; // 1 minute

// All admin routes require auth + admin check
router.use(loadSubscription, requireAdmin);

// ──────────────────────────────────────────────────────────────
// GET /api/admin/check — lightweight admin status check
// ──────────────────────────────────────────────────────────────
router.get('/check', (_req: Request, res: Response) => {
  // If we reach here, both loadSubscription and requireAdmin passed
  res.json({ isAdmin: true });
});

// ──────────────────────────────────────────────────────────────
// GET /api/admin/dashboard — aggregate metrics
// ──────────────────────────────────────────────────────────────
router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    // Try Redis cache first
    const cacheKey = 'admin:dashboard';
    const cached = await cacheGet<any>(cacheKey);
    if (cached) {
      res.json({ data: cached });
      return;
    }

    // Call the SECURITY DEFINER function for aggregate stats
    const statsResult = await query('SELECT * FROM admin_dashboard_stats()');
    const stats = statsResult.rows[0] || {};

    // Get recent signups (last 10) from auth_users
    const recentUsersResult = await query(
      `SELECT id, email, created_at, updated_at
       FROM auth_users
       ORDER BY created_at DESC
       LIMIT 10`
    );

    const recentSignups = recentUsersResult.rows.map((u: any) => ({
      id: u.id,
      email: u.email,
      createdAt: u.created_at,
      lastSignInAt: u.updated_at,
    }));

    const dashboard = {
      ...stats,
      recent_signups: recentSignups,
    };

    await cacheSet(cacheKey, dashboard, DASHBOARD_CACHE_TTL);
    res.json({ data: dashboard });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/admin/users — paginated user list with search/filter
// ──────────────────────────────────────────────────────────────
router.get('/users', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const search = (req.query.search as string) || null;
    const plan = (req.query.plan as string) || null;
    const status = (req.query.status as string) || null;
    const offset = (page - 1) * limit;

    const usersResult = await query(
      'SELECT * FROM admin_list_users($1, $2, $3, $4, $5)',
      [search, plan, status, limit, offset]
    );

    const users = usersResult.rows || [];
    const total = users[0]?.total_count || 0;

    res.json({
      data: {
        users: users.map((u: any) => ({
          id: u.id,
          email: u.email,
          displayName: u.display_name,
          fullName: u.full_name,
          plan: u.plan,
          status: u.status,
          paymentStatus: u.payment_status,
          dunningStep: u.dunning_step,
          documentCount: Number(u.document_count),
          aiQuestionsUsed: u.ai_questions_used,
          lastSignInAt: u.last_sign_in_at,
          createdAt: u.created_at,
        })),
        total: Number(total),
        page,
        limit,
      },
    });
  } catch (err) {
    console.error('Users list error:', err);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/admin/users/:userId — full user detail
// ──────────────────────────────────────────────────────────────
router.get('/users/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const detailResult = await query(
      'SELECT * FROM admin_get_user_detail($1)',
      [userId]
    );

    const detail = detailResult.rows[0] || null;

    if (!detail?.user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ data: detail });
  } catch (err) {
    console.error('User detail error:', err);
    res.status(500).json({ error: 'Failed to load user detail' });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /api/admin/users/:userId/update-plan — force plan change
// ──────────────────────────────────────────────────────────────
router.post('/users/:userId/update-plan', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { plan } = req.body;
    const adminId = req.userId!;

    if (!['free', 'starter', 'pro'].includes(plan)) {
      res.status(400).json({ error: 'Invalid plan. Must be free, starter, or pro.' });
      return;
    }

    // Get target user email for audit log
    const targetUserResult = await query(
      'SELECT id, email FROM auth_users WHERE id = $1',
      [userId]
    );
    if (targetUserResult.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const targetUser = targetUserResult.rows[0];

    // Update subscription plan — the set_subscription_defaults trigger
    // will automatically update limits and feature_flags
    await query(
      'UPDATE user_subscriptions SET plan = $1, updated_at = $2 WHERE user_id = $3',
      [plan, new Date().toISOString(), userId]
    );

    // Invalidate subscription cache
    await cacheDel(`sub:${userId}`);

    // Audit log
    await query(
      'INSERT INTO admin_audit_log (admin_id, action, target_user_id, target_email, details, ip_address) VALUES ($1, $2, $3, $4, $5, $6)',
      [adminId, 'update_plan', userId, targetUser.email, JSON.stringify({ new_plan: plan }), req.ip]
    );

    res.json({ success: true, message: `Plan updated to ${plan}` });
  } catch (err) {
    console.error('Update plan error:', err);
    res.status(500).json({ error: 'Failed to update plan' });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /api/admin/users/:userId/reset-ai-questions — reset counter
// ──────────────────────────────────────────────────────────────
router.post('/users/:userId/reset-ai-questions', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const adminId = req.userId!;

    const targetUserResult = await query(
      'SELECT id, email FROM auth_users WHERE id = $1',
      [userId]
    );
    if (targetUserResult.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const targetUser = targetUserResult.rows[0];

    await query(
      'UPDATE user_subscriptions SET ai_questions_used = 0, updated_at = $1 WHERE user_id = $2',
      [new Date().toISOString(), userId]
    );

    await cacheDel(`sub:${userId}`);

    await query(
      'INSERT INTO admin_audit_log (admin_id, action, target_user_id, target_email, ip_address) VALUES ($1, $2, $3, $4, $5)',
      [adminId, 'reset_ai_questions', userId, targetUser.email, req.ip]
    );

    res.json({ success: true, message: 'AI questions counter reset' });
  } catch (err) {
    console.error('Reset AI questions error:', err);
    res.status(500).json({ error: 'Failed to reset AI questions' });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /api/admin/users/:userId/unblock-device
// ──────────────────────────────────────────────────────────────
router.post('/users/:userId/unblock-device', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { deviceId } = req.body;
    const adminId = req.userId!;

    if (!deviceId) {
      res.status(400).json({ error: 'deviceId is required' });
      return;
    }

    await query(
      'UPDATE user_devices SET is_blocked = false WHERE user_id = $1 AND id = $2',
      [userId, deviceId]
    );

    await cacheDel(`device_count:${userId}`);

    const targetUserResult = await query(
      'SELECT id, email FROM auth_users WHERE id = $1',
      [userId]
    );
    const targetUser = targetUserResult.rows[0];

    await query(
      'INSERT INTO admin_audit_log (admin_id, action, target_user_id, target_email, details, ip_address) VALUES ($1, $2, $3, $4, $5, $6)',
      [adminId, 'unblock_device', userId, targetUser?.email, JSON.stringify({ device_id: deviceId }), req.ip]
    );

    res.json({ success: true, message: 'Device unblocked' });
  } catch (err) {
    console.error('Unblock device error:', err);
    res.status(500).json({ error: 'Failed to unblock device' });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /api/admin/impersonate/:userId — create impersonation session tokens
// ──────────────────────────────────────────────────────────────
router.post('/impersonate/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const adminId = req.userId!;

    // Prevent self-impersonation
    if (userId === adminId) {
      res.status(400).json({ error: 'Cannot impersonate yourself' });
      return;
    }

    // Find target user
    const targetUserResult = await query(
      'SELECT id, email FROM auth_users WHERE id = $1',
      [userId]
    );

    if (targetUserResult.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const targetUser = targetUserResult.rows[0];

    // Generate access and refresh tokens for the target user
    const accessToken = generateAccessToken(targetUser.id, targetUser.email);
    const refreshToken = await generateRefreshToken(targetUser.id);

    // Audit log — always log impersonation events
    await query(
      'INSERT INTO admin_audit_log (admin_id, action, target_user_id, target_email, ip_address) VALUES ($1, $2, $3, $4, $5)',
      [adminId, 'impersonate', userId, targetUser.email, req.ip]
    );

    // Generate HMAC-signed proof token so the impersonation tab can prove its
    // legitimacy to both the Express backend and Edge Functions.
    const impersonation_proof = generateImpersonationProof(adminId, userId);

    res.json({
      success: true,
      access_token: accessToken,
      refresh_token: refreshToken,
      impersonation_proof,
      user: {
        id: targetUser.id,
        email: targetUser.email,
      },
    });
  } catch (err) {
    console.error('Impersonation error:', err);
    res.status(500).json({ error: 'Failed to create impersonation session' });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/admin/activity — recent activity and violations
// ──────────────────────────────────────────────────────────────
router.get('/activity', async (req: Request, res: Response) => {
  try {
    const hours = Math.min(720, Math.max(1, parseInt(req.query.hours as string) || 24));
    const feature = (req.query.feature as string) || null;
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    // Recent usage logs
    let usageLogsResult;
    if (feature) {
      usageLogsResult = await query(
        'SELECT user_id, feature, metadata, timestamp FROM usage_logs WHERE timestamp >= $1 AND feature = $2 ORDER BY timestamp DESC LIMIT 100',
        [cutoff, feature]
      );
    } else {
      usageLogsResult = await query(
        'SELECT user_id, feature, metadata, timestamp FROM usage_logs WHERE timestamp >= $1 ORDER BY timestamp DESC LIMIT 100',
        [cutoff]
      );
    }
    const usageLogs = usageLogsResult.rows;

    // Feature breakdown
    const allLogsResult = await query(
      'SELECT feature FROM usage_logs WHERE timestamp >= $1',
      [cutoff]
    );
    const featureBreakdown: Record<string, number> = {};
    for (const log of allLogsResult.rows) {
      featureBreakdown[log.feature] = (featureBreakdown[log.feature] || 0) + 1;
    }

    // Recent limit violations
    const violationsResult = await query(
      'SELECT user_id, limit_type, current_value, limit_value, timestamp FROM limit_violations WHERE timestamp >= $1 ORDER BY timestamp DESC LIMIT 50',
      [cutoff]
    );
    const violations = violationsResult.rows;

    // Enrich usage logs with emails (batch lookup from auth_users)
    const userIds = new Set<string>();
    usageLogs.forEach((log: any) => userIds.add(log.user_id));
    violations.forEach((v: any) => userIds.add(v.user_id));

    const emailMap: Record<string, string> = {};
    if (userIds.size > 0) {
      const uidArray = Array.from(userIds);
      const emailsResult = await query(
        'SELECT id, email FROM auth_users WHERE id = ANY($1)',
        [uidArray]
      );
      for (const row of emailsResult.rows) {
        emailMap[row.id] = row.email;
      }
    }

    res.json({
      data: {
        recentActivity: usageLogs.map((log: any) => ({
          userId: log.user_id,
          email: emailMap[log.user_id] || 'unknown',
          feature: log.feature,
          metadata: log.metadata,
          timestamp: log.timestamp,
        })),
        featureBreakdown,
        violations: violations.map((v: any) => ({
          userId: v.user_id,
          email: emailMap[v.user_id] || 'unknown',
          limitType: v.limit_type,
          currentValue: v.current_value,
          limitValue: v.limit_value,
          timestamp: v.timestamp,
        })),
      },
    });
  } catch (err) {
    console.error('Activity error:', err);
    res.status(500).json({ error: 'Failed to load activity' });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/admin/system/health — system health metrics
// ──────────────────────────────────────────────────────────────
router.get('/system/health', async (_req: Request, res: Response) => {
  try {
    // Processing queue
    const pendingDocsResult = await query(
      'SELECT COUNT(*) AS count FROM documents WHERE processed = false'
    );
    const pendingDocs = parseInt(pendingDocsResult.rows[0]?.count || '0');

    const oldestPendingResult = await query(
      'SELECT created_at FROM documents WHERE processed = false ORDER BY created_at ASC LIMIT 1'
    );

    // Email delivery (24h and 7d)
    const now24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const now7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const emails24hResult = await query(
      'SELECT status FROM notification_logs WHERE sent_at >= $1',
      [now24h]
    );

    const emails7dResult = await query(
      'SELECT status FROM notification_logs WHERE sent_at >= $1',
      [now7d]
    );

    const emailStats = (logs: any[]) => {
      const sent = logs.filter(l => l.status === 'sent').length;
      const failed = logs.filter(l => l.status === 'failed').length;
      const total = sent + failed;
      return { sent, failed, rate: total > 0 ? Math.round((sent / total) * 100) : 100 };
    };

    // Recent email errors
    const emailErrorsResult = await query(
      'SELECT notification_type, error_message, sent_at FROM notification_logs WHERE status = $1 ORDER BY sent_at DESC LIMIT 10',
      ['failed']
    );

    // Embedding coverage
    const totalDocsResult = await query('SELECT COUNT(*) AS count FROM documents');
    const totalDocs = parseInt(totalDocsResult.rows[0]?.count || '0');

    const docsWithChunksResult = await query(
      'SELECT COUNT(*) AS count FROM documents WHERE processed = true'
    );
    const docsWithChunks = parseInt(docsWithChunksResult.rows[0]?.count || '0');

    // Dunning pipeline
    const dunningCountsResult = await query(
      'SELECT payment_status FROM user_subscriptions'
    );
    const dunningCounts = dunningCountsResult.rows;
    const dunning = {
      active: dunningCounts.filter((s: any) => s.payment_status === 'active').length,
      pastDue: dunningCounts.filter((s: any) => s.payment_status === 'past_due').length,
      restricted: dunningCounts.filter((s: any) => s.payment_status === 'restricted').length,
      downgraded: dunningCounts.filter((s: any) => s.payment_status === 'downgraded').length,
    };

    // Plaid connections
    const plaidItemsResult = await query('SELECT COUNT(*) AS count FROM plaid_items');
    const plaidItems = parseInt(plaidItemsResult.rows[0]?.count || '0');

    const plaidAccountsResult = await query('SELECT COUNT(*) AS count FROM plaid_accounts');
    const plaidAccounts = parseInt(plaidAccountsResult.rows[0]?.count || '0');

    // Device stats
    const totalDevicesResult = await query('SELECT COUNT(*) AS count FROM user_devices');
    const totalDevices = parseInt(totalDevicesResult.rows[0]?.count || '0');

    const activeDevicesResult = await query(
      'SELECT COUNT(*) AS count FROM user_devices WHERE last_active_at >= $1',
      [new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()]
    );
    const activeDevices = parseInt(activeDevicesResult.rows[0]?.count || '0');

    const blockedDevicesResult = await query(
      'SELECT COUNT(*) AS count FROM user_devices WHERE is_blocked = true'
    );
    const blockedDevices = parseInt(blockedDevicesResult.rows[0]?.count || '0');

    res.json({
      data: {
        processingQueue: {
          pending: pendingDocs,
          oldestPendingAt: oldestPendingResult.rows[0]?.created_at || null,
        },
        emailDelivery: {
          last24h: emailStats(emails24hResult.rows),
          last7d: emailStats(emails7dResult.rows),
          recentErrors: emailErrorsResult.rows.map((e: any) => ({
            type: e.notification_type,
            error: e.error_message,
            sentAt: e.sent_at,
          })),
        },
        embeddings: {
          totalDocuments: totalDocs,
          processedDocuments: docsWithChunks,
          coveragePercent: totalDocs ? Math.round((docsWithChunks / totalDocs) * 100) : 100,
        },
        dunning,
        plaid: {
          totalItems: plaidItems,
          totalAccounts: plaidAccounts,
        },
        devices: {
          total: totalDevices,
          active: activeDevices,
          blocked: blockedDevices,
        },
      },
    });
  } catch (err) {
    console.error('System health error:', err);
    res.status(500).json({ error: 'Failed to load system health' });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /api/admin/audit-log — admin action history
// ──────────────────────────────────────────────────────────────
router.get('/audit-log', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const offset = (page - 1) * limit;

    const logsResult = await query(
      'SELECT * FROM admin_audit_log ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    const logs = logsResult.rows;

    const countResult = await query('SELECT COUNT(*) AS count FROM admin_audit_log');
    const count = parseInt(countResult.rows[0]?.count || '0');

    // Enrich with admin emails from auth_users
    const adminIds = [...new Set(logs.map((l: any) => l.admin_id))];
    const adminEmails: Record<string, string> = {};
    if (adminIds.length > 0) {
      const emailsResult = await query(
        'SELECT id, email FROM auth_users WHERE id = ANY($1)',
        [adminIds]
      );
      for (const row of emailsResult.rows) {
        adminEmails[row.id] = row.email;
      }
    }

    res.json({
      data: {
        logs: logs.map((l: any) => ({
          id: l.id,
          adminId: l.admin_id,
          adminEmail: adminEmails[l.admin_id] || 'unknown',
          action: l.action,
          targetUserId: l.target_user_id,
          targetEmail: l.target_email,
          details: l.details,
          ipAddress: l.ip_address,
          createdAt: l.created_at,
        })),
        total: count,
        page,
        limit,
      },
    });
  } catch (err) {
    console.error('Audit log error:', err);
    res.status(500).json({ error: 'Failed to load audit log' });
  }
});

export default router;
