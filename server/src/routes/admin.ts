/**
 * Admin Routes
 *
 * All endpoints require authentication (loadSubscription) + admin role (requireAdmin).
 * Provides dashboard metrics, user management, impersonation, activity monitoring,
 * and system health endpoints.
 */

import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { loadSubscription } from '../middleware/subscriptionGuard';
import { requireAdmin } from '../middleware/requireAdmin';
import { cacheGet, cacheSet, cacheDel } from '../services/redisClient';
import { generateImpersonationProof } from '../middleware/impersonation';

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
    const { data: stats, error } = await supabase.rpc('admin_dashboard_stats');

    if (error) {
      console.error('Dashboard stats error:', error);
      res.status(500).json({ error: 'Failed to load dashboard stats' });
      return;
    }

    // Get recent signups (last 10)
    const { data: recentUsers } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 10,
    });

    const recentSignups = (recentUsers?.users || [])
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10)
      .map(u => ({
        id: u.id,
        email: u.email,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at,
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

    const { data: users, error } = await supabase.rpc('admin_list_users', {
      p_search: search,
      p_plan: plan,
      p_status: status,
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      console.error('Admin list users error:', error);
      res.status(500).json({ error: 'Failed to list users' });
      return;
    }

    const total = users?.[0]?.total_count || 0;

    res.json({
      data: {
        users: (users || []).map((u: any) => ({
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

    const { data: detail, error } = await supabase.rpc('admin_get_user_detail', {
      p_user_id: userId,
    });

    if (error) {
      console.error('Admin user detail error:', error);
      res.status(500).json({ error: 'Failed to load user detail' });
      return;
    }

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
    const { data: { user: targetUser } } = await supabase.auth.admin.getUserById(userId);
    if (!targetUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Update subscription plan — the set_subscription_defaults trigger
    // will automatically update limits and feature_flags
    const { error } = await supabase
      .from('user_subscriptions')
      .update({ plan, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    if (error) {
      console.error('Update plan error:', error);
      res.status(500).json({ error: 'Failed to update plan' });
      return;
    }

    // Invalidate subscription cache
    await cacheDel(`sub:${userId}`);

    // Audit log
    await supabase.from('admin_audit_log').insert({
      admin_id: adminId,
      action: 'update_plan',
      target_user_id: userId,
      target_email: targetUser.email,
      details: { new_plan: plan },
      ip_address: req.ip,
    });

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

    const { data: { user: targetUser } } = await supabase.auth.admin.getUserById(userId);
    if (!targetUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const { error } = await supabase
      .from('user_subscriptions')
      .update({
        ai_questions_used: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (error) {
      console.error('Reset AI questions error:', error);
      res.status(500).json({ error: 'Failed to reset AI questions' });
      return;
    }

    await cacheDel(`sub:${userId}`);

    await supabase.from('admin_audit_log').insert({
      admin_id: adminId,
      action: 'reset_ai_questions',
      target_user_id: userId,
      target_email: targetUser.email,
      ip_address: req.ip,
    });

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

    const { error } = await supabase
      .from('user_devices')
      .update({ is_blocked: false })
      .eq('user_id', userId)
      .eq('id', deviceId);

    if (error) {
      console.error('Unblock device error:', error);
      res.status(500).json({ error: 'Failed to unblock device' });
      return;
    }

    await cacheDel(`device_count:${userId}`);

    const { data: { user: targetUser } } = await supabase.auth.admin.getUserById(userId);

    await supabase.from('admin_audit_log').insert({
      admin_id: adminId,
      action: 'unblock_device',
      target_user_id: userId,
      target_email: targetUser?.email,
      details: { device_id: deviceId },
      ip_address: req.ip,
    });

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

    const { data: { user: targetUser }, error: userError } = await supabase.auth.admin.getUserById(userId);
    if (userError || !targetUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Step 1: Generate a magic link to get a one-time token
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: targetUser.email!,
    });

    if (linkError || !linkData.properties?.hashed_token) {
      console.error('Generate impersonation link error:', linkError);
      res.status(500).json({ error: 'Failed to generate impersonation token' });
      return;
    }

    // Step 2: Exchange the token hash for real session tokens server-side
    // by calling the Supabase auth /verify endpoint directly.
    // This gives us access_token + refresh_token without any browser redirects.
    const verifyRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
      },
      body: JSON.stringify({
        token_hash: linkData.properties.hashed_token,
        type: 'magiclink',
      }),
    });

    if (!verifyRes.ok) {
      const errBody = await verifyRes.text();
      console.error('Token exchange failed:', verifyRes.status, errBody);
      res.status(500).json({ error: 'Failed to create impersonation session' });
      return;
    }

    const sessionData = await verifyRes.json() as { access_token?: string; refresh_token?: string };

    if (!sessionData.access_token || !sessionData.refresh_token) {
      console.error('Token exchange returned no tokens:', sessionData);
      res.status(500).json({ error: 'Failed to create impersonation session — no tokens returned' });
      return;
    }

    // Audit log — always log impersonation events
    await supabase.from('admin_audit_log').insert({
      admin_id: adminId,
      action: 'impersonate',
      target_user_id: userId,
      target_email: targetUser.email,
      ip_address: req.ip,
    });

    // Generate HMAC-signed proof token so the impersonation tab can prove its
    // legitimacy to both the Express backend and Edge Functions. This prevents
    // regular users from faking impersonation to bypass quota limits.
    const impersonation_proof = generateImpersonationProof(adminId, userId);

    // Return the session tokens — the frontend will use setSession() in an isolated tab
    res.json({
      success: true,
      access_token: sessionData.access_token,
      refresh_token: sessionData.refresh_token,
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
    let usageQuery = supabase
      .from('usage_logs')
      .select('user_id, feature, metadata, timestamp')
      .gte('timestamp', cutoff)
      .order('timestamp', { ascending: false })
      .limit(100);

    if (feature) {
      usageQuery = usageQuery.eq('feature', feature);
    }

    const { data: usageLogs } = await usageQuery;

    // Feature breakdown
    const { data: allLogs } = await supabase
      .from('usage_logs')
      .select('feature')
      .gte('timestamp', cutoff);

    const featureBreakdown: Record<string, number> = {};
    (allLogs || []).forEach((log: any) => {
      featureBreakdown[log.feature] = (featureBreakdown[log.feature] || 0) + 1;
    });

    // Recent limit violations
    const { data: violations } = await supabase
      .from('limit_violations')
      .select('user_id, limit_type, current_value, limit_value, timestamp')
      .gte('timestamp', cutoff)
      .order('timestamp', { ascending: false })
      .limit(50);

    // Enrich usage logs with emails (batch lookup)
    const userIds = new Set<string>();
    (usageLogs || []).forEach((log: any) => userIds.add(log.user_id));
    (violations || []).forEach((v: any) => userIds.add(v.user_id));

    const emailMap: Record<string, string> = {};
    if (userIds.size > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, display_name')
        .in('id', Array.from(userIds));

      // Also get emails from admin API (batch)
      for (const uid of userIds) {
        try {
          const { data: { user } } = await supabase.auth.admin.getUserById(uid);
          if (user?.email) emailMap[uid] = user.email;
        } catch { /* skip */ }
      }
    }

    res.json({
      data: {
        recentActivity: (usageLogs || []).map((log: any) => ({
          userId: log.user_id,
          email: emailMap[log.user_id] || 'unknown',
          feature: log.feature,
          metadata: log.metadata,
          timestamp: log.timestamp,
        })),
        featureBreakdown,
        violations: (violations || []).map((v: any) => ({
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
    const { count: pendingDocs } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('processed', false);

    const { data: oldestPending } = await supabase
      .from('documents')
      .select('created_at')
      .eq('processed', false)
      .order('created_at', { ascending: true })
      .limit(1);

    // Email delivery (24h and 7d)
    const now24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const now7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: emails24h } = await supabase
      .from('notification_logs')
      .select('status')
      .gte('sent_at', now24h);

    const { data: emails7d } = await supabase
      .from('notification_logs')
      .select('status')
      .gte('sent_at', now7d);

    const emailStats = (logs: any[]) => {
      const sent = logs.filter(l => l.status === 'sent').length;
      const failed = logs.filter(l => l.status === 'failed').length;
      const total = sent + failed;
      return { sent, failed, rate: total > 0 ? Math.round((sent / total) * 100) : 100 };
    };

    // Recent email errors
    const { data: emailErrors } = await supabase
      .from('notification_logs')
      .select('notification_type, error_message, sent_at')
      .eq('status', 'failed')
      .order('sent_at', { ascending: false })
      .limit(10);

    // Embedding coverage
    const { count: totalDocs } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true });

    const { count: docsWithChunks } = await supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('processed', true);

    // Dunning pipeline
    const { data: dunningCounts } = await supabase
      .from('user_subscriptions')
      .select('payment_status');

    const dunning = {
      active: (dunningCounts || []).filter((s: any) => s.payment_status === 'active').length,
      pastDue: (dunningCounts || []).filter((s: any) => s.payment_status === 'past_due').length,
      restricted: (dunningCounts || []).filter((s: any) => s.payment_status === 'restricted').length,
      downgraded: (dunningCounts || []).filter((s: any) => s.payment_status === 'downgraded').length,
    };

    // Plaid connections
    const { count: plaidItems } = await supabase
      .from('plaid_items')
      .select('*', { count: 'exact', head: true });

    const { count: plaidAccounts } = await supabase
      .from('plaid_accounts')
      .select('*', { count: 'exact', head: true });

    // Device stats
    const { count: totalDevices } = await supabase
      .from('user_devices')
      .select('*', { count: 'exact', head: true });

    const { count: activeDevices } = await supabase
      .from('user_devices')
      .select('*', { count: 'exact', head: true })
      .gte('last_active_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    const { count: blockedDevices } = await supabase
      .from('user_devices')
      .select('*', { count: 'exact', head: true })
      .eq('is_blocked', true);

    res.json({
      data: {
        processingQueue: {
          pending: pendingDocs || 0,
          oldestPendingAt: oldestPending?.[0]?.created_at || null,
        },
        emailDelivery: {
          last24h: emailStats(emails24h || []),
          last7d: emailStats(emails7d || []),
          recentErrors: (emailErrors || []).map((e: any) => ({
            type: e.notification_type,
            error: e.error_message,
            sentAt: e.sent_at,
          })),
        },
        embeddings: {
          totalDocuments: totalDocs || 0,
          processedDocuments: docsWithChunks || 0,
          coveragePercent: totalDocs ? Math.round(((docsWithChunks || 0) / totalDocs) * 100) : 100,
        },
        dunning,
        plaid: {
          totalItems: plaidItems || 0,
          totalAccounts: plaidAccounts || 0,
        },
        devices: {
          total: totalDevices || 0,
          active: activeDevices || 0,
          blocked: blockedDevices || 0,
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

    const { data: logs, error, count } = await supabase
      .from('admin_audit_log')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Audit log error:', error);
      res.status(500).json({ error: 'Failed to load audit log' });
      return;
    }

    // Enrich with admin emails
    const adminIds = new Set((logs || []).map((l: any) => l.admin_id));
    const adminEmails: Record<string, string> = {};
    for (const aid of adminIds) {
      try {
        const { data: { user } } = await supabase.auth.admin.getUserById(aid);
        if (user?.email) adminEmails[aid] = user.email;
      } catch { /* skip */ }
    }

    res.json({
      data: {
        logs: (logs || []).map((l: any) => ({
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
        total: count || 0,
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
