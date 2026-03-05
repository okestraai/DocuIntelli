/**
 * DocuIntelli AI - Cron Job Scheduler
 *
 * Runs all scheduled tasks in-process using node-cron.
 * Replaces the Supabase pg_cron + Edge Function HTTP dispatch pattern.
 *
 * All times are UTC. Every task is wrapped with error handling
 * so a single failure never crashes the server.
 */

import cron from 'node-cron';
import { query } from './db';
import { sendNotificationEmail, resolveUserInfo } from './emailService';
import { processDocumentVLLMEmbeddings } from './vllmEmbeddings';
import { generateDocumentTags } from './tagGeneration';
import { runDunningEscalation } from './dunningService';
import { autoGrantExpiredCooldowns, sendCooldownReminders, reverifyStaleContacts } from './emergencyAccessService';

// ============================================================================
// Types
// ============================================================================

type HealthState = 'healthy' | 'watch' | 'risk' | 'critical';

interface DocRow {
  id: string;
  user_id: string;
  name: string;
  category: string;
  tags: string[] | null;
  expiration_date: string | null;
  upload_date: string;
  last_reviewed_at: string | null;
  review_cadence_days: number | null;
  issuer: string | null;
  owner_name: string | null;
}

// ============================================================================
// Health Computation (pure functions)
// ============================================================================

function computeHealth(doc: DocRow, now: Date): { state: HealthState; score: number } {
  let score = 100;

  // Expiration proximity penalty
  if (doc.expiration_date) {
    const days = Math.ceil(
      (new Date(doc.expiration_date).getTime() - now.getTime()) / 86400000,
    );
    if (days < 0) score -= 50;
    else if (days <= 7) score -= 40;
    else if (days <= 30) score -= 25;
    else if (days <= 90) score -= 10;
  }

  // Review cadence penalty
  if (doc.review_cadence_days) {
    const last = doc.last_reviewed_at
      ? new Date(doc.last_reviewed_at)
      : new Date(doc.upload_date);
    const overdue =
      Math.ceil((now.getTime() - last.getTime()) / 86400000) -
      doc.review_cadence_days;
    if (overdue > 60) score -= 30;
    else if (overdue > 0) score -= 15;
    else if (
      doc.review_cadence_days -
        Math.ceil((now.getTime() - last.getTime()) / 86400000) <=
      14
    )
      score -= 5;
  } else if (!doc.expiration_date) {
    // No cadence and no expiration — staleness penalty
    const lastAction = doc.last_reviewed_at
      ? new Date(doc.last_reviewed_at)
      : new Date(doc.upload_date);
    const daysSince = Math.ceil(
      (now.getTime() - lastAction.getTime()) / 86400000,
    );
    if (daysSince > 365) score -= 20;
    else if (daysSince > 180) score -= 10;
  }

  // Metadata completeness penalty
  const missing = [
    !doc.tags || doc.tags.length === 0,
    !doc.expiration_date && !doc.review_cadence_days,
    !doc.issuer,
    !doc.owner_name,
  ].filter(Boolean).length;
  if (missing >= 3) score -= 15;
  else score -= 5 * missing;

  score = Math.max(0, Math.min(100, score));
  const state: HealthState =
    score >= 75
      ? 'healthy'
      : score >= 50
        ? 'watch'
        : score >= 25
          ? 'risk'
          : 'critical';

  return { state, score };
}

function computePreparedness(docs: DocRow[], now: Date): { score: number } {
  if (docs.length === 0) return { score: 0 };
  const t = docs.length;

  const withExp = docs.filter((d) => d.expiration_date).length;
  const withTags = docs.filter((d) => d.tags && d.tags.length > 0).length;
  const withCat = docs.filter((d) => d.category && d.category !== 'other').length;
  const withIssuer = docs.filter((d) => d.issuer).length;
  const metaScore =
    ((withExp / t) * 0.35 +
      (withTags / t) * 0.25 +
      (withCat / t) * 0.2 +
      (withIssuer / t) * 0.2) *
    25;

  const expScore = (withExp / t) * 25;

  const sixMo = new Date(now.getTime() - 180 * 86400000);
  const reviewed = docs.filter((d) => {
    const dt = d.last_reviewed_at
      ? new Date(d.last_reviewed_at)
      : new Date(d.upload_date);
    return dt >= sixMo;
  }).length;
  const reviewScore = (reviewed / t) * 25;

  let healthy = 0;
  let watch = 0;
  for (const d of docs) {
    const h = computeHealth(d, now);
    if (h.state === 'healthy') healthy++;
    else if (h.state === 'watch') watch++;
  }
  const healthScore = (healthy / t) * 25 + (watch / t) * 15;

  return {
    score: Math.round(
      Math.max(0, Math.min(100, metaScore + expScore + reviewScore + healthScore)),
    ),
  };
}

// ============================================================================
// DB Helpers
// ============================================================================

const DOC_SELECT =
  'id, user_id, name, category, type, tags, expiration_date, upload_date, last_reviewed_at, review_cadence_days, issuer, owner_name, effective_date, status, processed, health_state, health_computed_at';

async function getActiveUserIds(): Promise<string[]> {
  const result = await query('SELECT DISTINCT user_id FROM documents LIMIT 10000');
  return result.rows.map((r: { user_id: string }) => r.user_id);
}

async function fetchUserDocs(userId: string): Promise<DocRow[]> {
  const result = await query(
    `SELECT ${DOC_SELECT} FROM documents WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return result.rows as DocRow[];
}

// ============================================================================
// Task 1: Expiration Notifications — Daily 08:00 UTC
// ============================================================================

async function runExpirationNotifications(userId?: string): Promise<Record<string, unknown>> {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const cutoff = new Date(now.getTime() + 30 * 86400000)
    .toISOString()
    .split('T')[0];

  const docsResult = userId
    ? await query(
        `SELECT id, user_id, name, category, expiration_date
         FROM documents
         WHERE expiration_date >= $1 AND expiration_date <= $2 AND user_id = $3`,
        [today, cutoff, userId],
      )
    : await query(
        `SELECT id, user_id, name, category, expiration_date
         FROM documents
         WHERE expiration_date >= $1 AND expiration_date <= $2`,
        [today, cutoff],
      );
  const docs = docsResult.rows;

  if (!docs || docs.length === 0) return { sent: 0, docs: 0 };

  // Group by user
  const byUser = new Map<string, typeof docs>();
  for (const d of docs) {
    const list = byUser.get(d.user_id) || [];
    list.push(d);
    byUser.set(d.user_id, list);
  }

  let sent = 0;
  for (const [userId, userDocs] of byUser) {
    try {
      // Skip if already notified today
      const recentResult = await query(
        `SELECT id FROM notification_logs
         WHERE user_id = $1
           AND notification_type = $2
           AND sent_at >= $3
         LIMIT 1`,
        [userId, 'email:document_expiring', `${today}T00:00:00Z`],
      );
      if (recentResult.rows.length > 0) continue;

      const userInfo = await resolveUserInfo(userId);
      if (!userInfo) continue;
      const { userName } = userInfo;

      const sorted = [...userDocs].sort(
        (a, b) =>
          new Date(a.expiration_date).getTime() -
          new Date(b.expiration_date).getTime(),
      );

      // Build document list for template
      const documents = sorted.slice(0, 5).map((d) => {
        const days = Math.ceil(
          (new Date(d.expiration_date).getTime() - now.getTime()) / 86400000,
        );
        return {
          name: d.name,
          category: d.category,
          expirationDate: d.expiration_date,
          daysUntilExpiry: days,
        };
      });

      const result = await sendNotificationEmail(userId, 'document_expiring', {
        userName,
        documents,
        expiringCount: userDocs.length,
      });
      if (result.sent) sent++;
    } catch (err) {
      console.error(`[CRON] expiration-notifications: Error for user ${userId}:`, err);
    }
  }

  return { sent, totalDocs: docs.length, users: byUser.size };
}

// ============================================================================
// Task 2: Weekly Audit Email — Sunday 22:00 UTC
// ============================================================================

async function runWeeklyAuditEmail(targetUserId?: string): Promise<Record<string, unknown>> {
  const userIds = targetUserId ? [targetUserId] : await getActiveUserIds();
  const now = new Date();
  let sent = 0;

  for (const userId of userIds) {
    try {
      const userInfo = await resolveUserInfo(userId);
      if (!userInfo) continue;
      const { userName } = userInfo;

      const docs = await fetchUserDocs(userId);
      if (docs.length === 0) continue;

      const prep = computePreparedness(docs, now);
      const thirtyDays = new Date(now.getTime() + 30 * 86400000);

      let healthy = 0,
        watch = 0,
        risk = 0,
        critical = 0;
      for (const d of docs) {
        const h = computeHealth(d, now);
        if (h.state === 'healthy') healthy++;
        else if (h.state === 'watch') watch++;
        else if (h.state === 'risk') risk++;
        else critical++;
      }

      const expiring = docs.filter((d) => {
        if (!d.expiration_date) return false;
        const exp = new Date(d.expiration_date);
        return exp <= thirtyDays && exp >= now;
      });

      const incomplete = docs.filter((d) => {
        const missing = [
          !d.tags || d.tags.length === 0,
          !d.issuer,
          !d.owner_name,
          !d.expiration_date && !d.review_cadence_days,
        ].filter(Boolean).length;
        return missing >= 2;
      });

      const result = await sendNotificationEmail(userId, 'weekly_audit', {
        userName,
        score: prep.score,
        healthy,
        watch,
        risk,
        critical,
        totalDocs: docs.length,
        expiringSoon: expiring.length,
        incompleteMetadata: incomplete.length,
      });
      if (result.sent) sent++;
    } catch (err) {
      console.error(`[CRON] weekly-audit-email: Error for user ${userId}:`, err);
    }
  }

  return { sent, totalUsers: userIds.length };
}

// ============================================================================
// Task 3: Preparedness Snapshots — Daily 00:30 UTC
// ============================================================================

async function runPreparednessSnapshots(targetUserId?: string): Promise<Record<string, unknown>> {
  const userIds = targetUserId ? [targetUserId] : await getActiveUserIds();
  const today = new Date().toISOString().split('T')[0];
  const now = new Date();
  let saved = 0;

  for (const userId of userIds) {
    try {
      const docs = await fetchUserDocs(userId);
      if (docs.length === 0) continue;

      const prep = computePreparedness(docs, now);

      let healthy = 0,
        watch = 0,
        risk = 0,
        critical = 0;
      for (const d of docs) {
        const h = computeHealth(d, now);
        if (h.state === 'healthy') healthy++;
        else if (h.state === 'watch') watch++;
        else if (h.state === 'risk') risk++;
        else critical++;
      }

      await query(
        `INSERT INTO preparedness_snapshots (user_id, score, factors, snapshot_date)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, snapshot_date)
         DO UPDATE SET score = $2, factors = $3`,
        [
          userId,
          prep.score,
          JSON.stringify({
            details: {
              totalDocs: docs.length,
              docsHealthy: healthy,
              docsWatch: watch,
              docsRisk: risk,
              docsCritical: critical,
            },
          }),
          today,
        ],
      );
      saved++;
    } catch (err) {
      console.error(`[CRON] preparedness-snapshots: Error for user ${userId}:`, err);
    }
  }

  return { saved, totalUsers: userIds.length };
}

// ============================================================================
// Task 4: Stripe Billing Sync — Daily 05:00 UTC
// ============================================================================

async function runStripeBillingSync(userId?: string): Promise<Record<string, unknown>> {
  const subsResult = userId
    ? await query(
        `SELECT user_id, stripe_customer_id
         FROM user_subscriptions
         WHERE stripe_customer_id IS NOT NULL AND user_id = $1`,
        [userId],
      )
    : await query(
        `SELECT user_id, stripe_customer_id
         FROM user_subscriptions
         WHERE stripe_customer_id IS NOT NULL`,
      );
  const subs = subsResult.rows;

  if (!subs || subs.length === 0) return { synced: 0 };

  const port = process.env.PORT || '5000';
  const cronSecret = process.env.CRON_SECRET || process.env.JWT_SECRET || '';

  let synced = 0;
  for (const sub of subs) {
    try {
      const resp = await fetch(
        `http://localhost:${port}/api/stripe/sync-billing`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cronSecret}`,
          },
          body: JSON.stringify({
            customer_id: sub.stripe_customer_id,
            user_id: sub.user_id,
          }),
        },
      );
      if (resp.ok) synced++;
      else {
        const errText = await resp.text();
        console.error(`[CRON] stripe-billing-sync: ${sub.stripe_customer_id} returned ${resp.status}: ${errText}`);
      }
    } catch (err) {
      console.error(`[CRON] stripe-billing-sync: ${sub.stripe_customer_id}:`, err);
    }
  }

  return { synced, total: subs.length };
}

// ============================================================================
// Task 5: Life Event Readiness Refresh — Daily 03:00 UTC
// ============================================================================

async function runLifeEventReadiness(userId?: string): Promise<Record<string, unknown>> {
  const eventsResult = userId
    ? await query(
        `SELECT id, user_id, title, readiness_score
         FROM life_events
         WHERE status = $1 AND user_id = $2`,
        ['active', userId],
      )
    : await query(
        `SELECT id, user_id, title, readiness_score
         FROM life_events
         WHERE status = $1`,
        ['active'],
      );
  const events = eventsResult.rows;

  if (!events || events.length === 0) return { refreshed: 0 };

  const now = new Date();
  let refreshed = 0;

  for (const event of events) {
    try {
      // Fetch requirement statuses
      const reqsResult = await query(
        `SELECT requirement_id, status, matched_documents
         FROM life_event_requirement_status
         WHERE life_event_id = $1`,
        [event.id],
      );
      const reqs = reqsResult.rows;
      if (!reqs || reqs.length === 0) continue;

      // Fetch user documents for matching
      const userDocsResult = await query(
        `SELECT id, name, category, tags, expiration_date
         FROM documents
         WHERE user_id = $1`,
        [event.user_id],
      );
      const userDocs = userDocsResult.rows;
      if (!userDocs) continue;

      // Check if any matched documents have expired since last check
      for (const req of reqs) {
        if (req.status === 'satisfied' && req.matched_documents) {
          const matchedDocs = Array.isArray(req.matched_documents)
            ? req.matched_documents
            : [];
          for (const match of matchedDocs) {
            const doc = userDocs.find(
              (d: { id: string }) => d.id === match.documentId,
            );
            if (doc?.expiration_date && new Date(doc.expiration_date) < now) {
              // Document expired — mark requirement as needs_update
              await query(
                `UPDATE life_event_requirement_status
                 SET status = $1, updated_at = $2
                 WHERE life_event_id = $3 AND requirement_id = $4`,
                ['needs_update', now.toISOString(), event.id, req.requirement_id],
              );
            }
          }
        }
      }

      // Recompute readiness score
      const allReqsResult = await query(
        `SELECT status
         FROM life_event_requirement_status
         WHERE life_event_id = $1 AND status != $2`,
        [event.id, 'not_applicable'],
      );
      const allReqs = allReqsResult.rows;

      if (allReqs && allReqs.length > 0) {
        const satisfied = allReqs.filter(
          (r: { status: string }) => r.status === 'satisfied',
        ).length;
        const expiringSoon = allReqs.filter(
          (r: { status: string }) => r.status === 'expiring_soon',
        ).length;
        const score = Math.round(
          ((satisfied + expiringSoon * 0.75) / allReqs.length) * 100,
        );

        await query(
          `UPDATE life_events SET readiness_score = $1, updated_at = $2 WHERE id = $3`,
          [score, now.toISOString(), event.id],
        );
      }

      refreshed++;
    } catch (err) {
      console.error(`[CRON] life-event-readiness: Event ${event.id}:`, err);
    }
  }

  return { refreshed, total: events.length };
}

// ============================================================================
// Task 6: Review Cadence Reminders — Monday 09:00 UTC
// ============================================================================

async function runReviewCadenceReminders(userId?: string): Promise<Record<string, unknown>> {
  const now = new Date();

  const docsResult = userId
    ? await query(
        `SELECT id, user_id, name, category, last_reviewed_at, upload_date, review_cadence_days
         FROM documents
         WHERE review_cadence_days IS NOT NULL AND user_id = $1`,
        [userId],
      )
    : await query(
        `SELECT id, user_id, name, category, last_reviewed_at, upload_date, review_cadence_days
         FROM documents
         WHERE review_cadence_days IS NOT NULL`,
      );
  const docs = docsResult.rows;

  if (!docs || docs.length === 0) return { sent: 0 };

  // Find overdue documents
  const overdue = docs.filter((d: any) => {
    const last = d.last_reviewed_at
      ? new Date(d.last_reviewed_at)
      : new Date(d.upload_date);
    const next = new Date(last.getTime() + d.review_cadence_days * 86400000);
    return next <= now;
  });

  if (overdue.length === 0) return { sent: 0, overdue: 0 };

  // Group by user
  const byUser = new Map<string, typeof overdue>();
  for (const d of overdue) {
    const list = byUser.get(d.user_id) || [];
    list.push(d);
    byUser.set(d.user_id, list);
  }

  let sent = 0;
  const weekAgo = new Date(now.getTime() - 7 * 86400000);

  for (const [userId, userDocs] of byUser) {
    try {
      // Deduplicate: 1 email per user per week
      const recentResult = await query(
        `SELECT id FROM notification_logs
         WHERE user_id = $1
           AND notification_type = $2
           AND sent_at >= $3
         LIMIT 1`,
        [userId, 'email:document_review_overdue', weekAgo.toISOString()],
      );
      if (recentResult.rows.length > 0) continue;

      const userInfo = await resolveUserInfo(userId);
      if (!userInfo) continue;
      const { userName } = userInfo;

      // Build document list for template
      const documents = userDocs.slice(0, 5).map((d: any) => {
        const last = d.last_reviewed_at
          ? new Date(d.last_reviewed_at)
          : new Date(d.upload_date);
        const daysOverdue = Math.ceil(
          (now.getTime() - last.getTime()) / 86400000,
        );
        return {
          name: d.name,
          category: d.category,
          daysOverdue,
        };
      });

      const result = await sendNotificationEmail(
        userId,
        'document_review_overdue',
        {
          userName,
          documents,
          overdueCount: userDocs.length,
        },
      );
      if (result.sent) sent++;
    } catch (err) {
      console.error(`[CRON] review-cadence-reminders: Error for user ${userId}:`, err);
    }
  }

  return { sent, overdue: overdue.length, users: byUser.size };
}

// ============================================================================
// Task 7: Stuck Docs Processing — Every 30 minutes
// ============================================================================

async function runStuckDocsProcessing(userId?: string): Promise<Record<string, unknown>> {
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  // --- Phase 1: Fix stuck unprocessed documents ---

  const stuckResult = userId
    ? await query(
        `SELECT id, name FROM documents
         WHERE processed = false AND created_at < $1 AND user_id = $2
         LIMIT 10`,
        [tenMinAgo, userId],
      )
    : await query(
        `SELECT id, name FROM documents
         WHERE processed = false AND created_at < $1
         LIMIT 10`,
        [tenMinAgo],
      );
  const stuck = stuckResult.rows;

  let processed = 0;
  if (stuck && stuck.length > 0) {
    for (const doc of stuck) {
      try {
        // Check if document has chunks with null embeddings
        const nullEmbResult = await query(
          `SELECT COUNT(*) as count FROM document_chunks
           WHERE document_id = $1 AND embedding IS NULL`,
          [doc.id],
        );
        const nullEmbCount = parseInt(nullEmbResult.rows[0]?.count || '0', 10);

        if (nullEmbCount > 0) {
          // Re-trigger embedding generation
          await processDocumentVLLMEmbeddings(doc.id);
          processed++;
        } else {
          // All chunks have embeddings — mark as processed
          await query(
            'UPDATE documents SET processed = true WHERE id = $1',
            [doc.id],
          );
          processed++;
        }
      } catch (err) {
        console.error(`[CRON] stuck-docs: Failed to process ${doc.id}:`, err);
      }
    }
  }

  // --- Phase 2: Generate tags for documents with >= 60% embeddings but no tags ---

  const untaggedResult = userId
    ? await query(
        `SELECT id, name FROM documents
         WHERE (tags IS NULL OR tags = '{}') AND user_id = $1
         LIMIT 20`,
        [userId],
      )
    : await query(
        `SELECT id, name FROM documents
         WHERE tags IS NULL OR tags = '{}'
         LIMIT 20`,
      );
  const untagged = untaggedResult.rows;

  let tagged = 0;
  if (untagged && untagged.length > 0) {
    for (const doc of untagged) {
      try {
        // Count total chunks
        const totalResult = await query(
          'SELECT COUNT(*) as count FROM document_chunks WHERE document_id = $1',
          [doc.id],
        );
        const totalChunks = parseInt(totalResult.rows[0]?.count || '0', 10);
        if (totalChunks === 0) continue;

        // Count chunks with embeddings
        const embeddedResult = await query(
          'SELECT COUNT(*) as count FROM document_chunks WHERE document_id = $1 AND embedding IS NOT NULL',
          [doc.id],
        );
        const embeddedChunks = parseInt(
          embeddedResult.rows[0]?.count || '0',
          10,
        );

        const progress = embeddedChunks / totalChunks;
        if (progress < 0.6) continue; // Not enough embeddings yet

        console.log(
          `[CRON] stuck-docs: Triggering tag generation for "${doc.name}" (${Math.round(progress * 100)}% embedded)`,
        );

        await generateDocumentTags(doc.id);
        tagged++;
      } catch (err) {
        console.error(`[CRON] stuck-docs: Failed to tag ${doc.id}:`, err);
      }
    }
  }

  return {
    stuckFound: stuck?.length || 0,
    processed,
    untaggedFound: untagged?.length || 0,
    tagged,
  };
}

// ============================================================================
// Task 8: Dunning Escalation — Daily 06:00 UTC
// ============================================================================

async function runDunningEscalationTask(_userId?: string): Promise<Record<string, unknown>> {
  const result = await runDunningEscalation();
  return {
    processed: result.processed,
    recovered: result.recovered,
    errors: result.errors,
  };
}

// ============================================================================
// Task 9: Goal Deadline Check — Daily 04:00 UTC
// ============================================================================

async function runGoalDeadlineCheck(userId?: string): Promise<Record<string, unknown>> {
  const today = new Date();
  const sevenDaysOut = new Date(today.getTime() + 7 * 86400000)
    .toISOString()
    .split('T')[0];
  const todayStr = today.toISOString().split('T')[0];

  // Find active goals with target_date within 7 days
  const goalsResult = userId
    ? await query(
        `SELECT id, user_id, name, target_amount, current_amount, target_date
         FROM financial_goals
         WHERE status = $1 AND target_date >= $2 AND target_date <= $3 AND user_id = $4`,
        ['active', todayStr, sevenDaysOut, userId],
      )
    : await query(
        `SELECT id, user_id, name, target_amount, current_amount, target_date
         FROM financial_goals
         WHERE status = $1 AND target_date >= $2 AND target_date <= $3`,
        ['active', todayStr, sevenDaysOut],
      );
  const goals = goalsResult.rows;

  if (!goals || goals.length === 0) return { sent: 0, checked: 0 };

  let sent = 0;
  for (const goal of goals) {
    try {
      // Deduplicate: check if we already notified about this goal's deadline
      const existingResult = await query(
        `SELECT id FROM notification_logs
         WHERE user_id = $1
           AND notification_type = $2
           AND sent_at >= $3
         LIMIT 1`,
        [
          goal.user_id,
          'email:goal_deadline_approaching',
          new Date(today.getTime() - 3 * 86400000).toISOString(),
        ],
      );
      if (existingResult.rows.length > 0) continue;

      const daysUntil = Math.ceil(
        (new Date(goal.target_date).getTime() - today.getTime()) / 86400000,
      );
      const progressPct =
        goal.target_amount > 0
          ? Math.round((goal.current_amount / goal.target_amount) * 100)
          : 0;

      const userInfo = await resolveUserInfo(goal.user_id);
      const userName = userInfo?.userName || '';

      await sendNotificationEmail(goal.user_id, 'goal_deadline_approaching', {
        userName,
        goalName: goal.name,
        daysUntil,
        progressPct,
        currentAmount: goal.current_amount,
        targetAmount: goal.target_amount,
      });
      sent++;
    } catch (err) {
      console.error(`[CRON] goal-deadline-check: Goal ${goal.id}:`, err);
    }
  }

  return { sent, checked: goals.length };
}

// ============================================================================
// Task 10: AI Questions Reset — Daily 00:05 UTC
// ============================================================================

async function runAIQuestionsReset(userId?: string): Promise<Record<string, unknown>> {
  const result = userId
    ? await query('UPDATE user_subscriptions SET ai_questions_used = 0 WHERE user_id = $1', [userId])
    : await query('UPDATE user_subscriptions SET ai_questions_used = 0');
  return { reset: result.rowCount || 0 };
}

// ============================================================================
// Task 11: Data Cleanup — Daily 02:00 UTC
// ============================================================================

async function runDataCleanup(_userId?: string): Promise<Record<string, unknown>> {
  const results: Record<string, number> = {};

  // Delete notification_logs older than 90 days
  const notifResult = await query(
    "DELETE FROM notification_logs WHERE sent_at < NOW() - INTERVAL '90 days'",
  );
  results.notificationLogs = notifResult.rowCount || 0;

  // Delete usage_logs older than 30 days
  const usageResult = await query(
    "DELETE FROM usage_logs WHERE timestamp < NOW() - INTERVAL '30 days'",
  );
  results.usageLogs = usageResult.rowCount || 0;

  // Delete limit_violations older than 180 days
  const violResult = await query(
    "DELETE FROM limit_violations WHERE timestamp < NOW() - INTERVAL '180 days'",
  );
  results.limitViolations = violResult.rowCount || 0;

  // Delete review_events older than 365 days
  const reviewResult = await query(
    "DELETE FROM review_events WHERE created_at < NOW() - INTERVAL '365 days'",
  );
  results.reviewEvents = reviewResult.rowCount || 0;

  // Delete orphaned document_chunks (chunks with no matching document)
  const orphanResult = await query(
    `DELETE FROM document_chunks
     WHERE document_id NOT IN (SELECT id FROM documents)`,
  );
  results.orphanedChunks = orphanResult.rowCount || 0;

  return results;
}

// ============================================================================
// Task Wrapper
// ============================================================================

function wrapTask(
  name: string,
  fn: () => Promise<Record<string, unknown>>,
): () => void {
  return () => {
    const startedAt = new Date().toISOString();
    console.log(`[CRON] ${name} started at ${startedAt}`);
    fn()
      .then((result) => {
        console.log(`[CRON] ${name} completed at ${new Date().toISOString()}:`, result);
      })
      .catch((err) => {
        console.error(`[CRON] ${name} failed at ${new Date().toISOString()}:`, err);
      });
  };
}

// ============================================================================
// Scheduler Startup
// ============================================================================

const TIMEZONE = 'UTC';

export function startScheduler(): void {
  console.log('[SCHEDULER] Starting cron jobs...');

  // Task 1: Expiration Notifications — daily 8am UTC
  cron.schedule(
    '0 8 * * *',
    wrapTask('expiration-notifications', runExpirationNotifications),
    { timezone: TIMEZONE },
  );

  // Task 2: Weekly Audit Email — Sunday 10pm UTC
  cron.schedule(
    '0 22 * * 0',
    wrapTask('weekly-audit-email', runWeeklyAuditEmail),
    { timezone: TIMEZONE },
  );

  // Task 3: Preparedness Snapshots — daily 00:30 UTC
  cron.schedule(
    '30 0 * * *',
    wrapTask('preparedness-snapshots', runPreparednessSnapshots),
    { timezone: TIMEZONE },
  );

  // Task 4: Stripe Billing Sync — daily 5am UTC
  cron.schedule(
    '0 5 * * *',
    wrapTask('stripe-billing-sync', runStripeBillingSync),
    { timezone: TIMEZONE },
  );

  // Task 5: Life Event Readiness — daily 3am UTC
  cron.schedule(
    '0 3 * * *',
    wrapTask('life-event-readiness', runLifeEventReadiness),
    { timezone: TIMEZONE },
  );

  // Task 6: Review Cadence Reminders — Monday 9am UTC
  cron.schedule(
    '0 9 * * 1',
    wrapTask('review-cadence-reminders', runReviewCadenceReminders),
    { timezone: TIMEZONE },
  );

  // Task 7: Stuck Docs Processing — every 30 minutes
  cron.schedule(
    '*/30 * * * *',
    wrapTask('stuck-docs-processing', runStuckDocsProcessing),
    { timezone: TIMEZONE },
  );

  // Task 8: Dunning Escalation — daily 6am UTC
  cron.schedule(
    '0 6 * * *',
    wrapTask('dunning-escalation', runDunningEscalationTask),
    { timezone: TIMEZONE },
  );

  // Task 9: Goal Deadline Check — daily 4am UTC
  cron.schedule(
    '0 4 * * *',
    wrapTask('goal-deadline-check', runGoalDeadlineCheck),
    { timezone: TIMEZONE },
  );

  // Task 10: AI Questions Reset — daily 00:05 UTC
  cron.schedule(
    '5 0 * * *',
    wrapTask('ai-questions-reset', runAIQuestionsReset),
    { timezone: TIMEZONE },
  );

  // Task 11: Data Cleanup — daily 2am UTC
  cron.schedule(
    '0 2 * * *',
    wrapTask('data-cleanup', runDataCleanup),
    { timezone: TIMEZONE },
  );

  // Task 12: Emergency Access Auto-Grant — every 15 minutes
  cron.schedule(
    '*/15 * * * *',
    wrapTask('emergency-auto-grant', runEmergencyAutoGrant),
    { timezone: TIMEZONE },
  );

  // Task 13: Emergency Cooldown Reminders — hourly
  cron.schedule(
    '0 * * * *',
    wrapTask('emergency-cooldown-reminders', runEmergencyCooldownReminders),
    { timezone: TIMEZONE },
  );

  // Task 14: Trusted Contact Re-verification — 1st of month 10am UTC
  cron.schedule(
    '0 10 1 * *',
    wrapTask('contact-reverification', runContactReverification),
    { timezone: TIMEZONE },
  );

  console.log('[SCHEDULER] All 14 cron jobs registered');
  console.log('[SCHEDULER] Schedule summary:');
  console.log('  00:05 UTC daily     — AI questions reset');
  console.log('  00:30 UTC daily     — Preparedness snapshots');
  console.log('  02:00 UTC daily     — Data cleanup');
  console.log('  03:00 UTC daily     — Life event readiness');
  console.log('  04:00 UTC daily     — Goal deadline check');
  console.log('  05:00 UTC daily     — Stripe billing sync');
  console.log('  06:00 UTC daily     — Dunning escalation');
  console.log('  08:00 UTC daily     — Expiration notifications');
  console.log('  09:00 UTC Mon       — Review cadence reminders');
  console.log('  22:00 UTC Sun       — Weekly audit email');
  console.log('  Every 30 min        — Stuck docs processing');
  console.log('  Every 15 min        — Emergency access auto-grant');
  console.log('  Every hour          — Emergency cooldown reminders');
  console.log('  10:00 UTC 1st/mo    — Contact re-verification');
}

// ============================================================================
// Emergency Access Tasks
// ============================================================================

async function runEmergencyAutoGrant(): Promise<Record<string, unknown>> {
  const granted = await autoGrantExpiredCooldowns();
  return { auto_granted: granted };
}

async function runEmergencyCooldownReminders(): Promise<Record<string, unknown>> {
  const sent = await sendCooldownReminders();
  return { reminders_sent: sent };
}

async function runContactReverification(): Promise<Record<string, unknown>> {
  const stale = await reverifyStaleContacts();
  return { stale_contacts: stale };
}

// ============================================================================
// Exported task functions for admin manual trigger
// ============================================================================

export const cronTasks: Record<string, (userId?: string) => Promise<Record<string, unknown>>> = {
  'expiration-notifications': runExpirationNotifications,
  'weekly-audit-email': runWeeklyAuditEmail,
  'preparedness-snapshots': runPreparednessSnapshots,
  'stripe-billing-sync': runStripeBillingSync,
  'life-event-readiness': runLifeEventReadiness,
  'review-cadence-reminders': runReviewCadenceReminders,
  'stuck-docs-processing': runStuckDocsProcessing,
  'dunning-escalation': runDunningEscalationTask,
  'goal-deadline-check': runGoalDeadlineCheck,
  'ai-questions-reset': runAIQuestionsReset,
  'data-cleanup': runDataCleanup,
  'emergency-auto-grant': runEmergencyAutoGrant,
  'emergency-cooldown-reminders': runEmergencyCooldownReminders,
  'contact-reverification': runContactReverification,
};

// Jobs that ignore userId (operate globally)
export const GLOBAL_ONLY_JOBS = new Set(['dunning-escalation', 'data-cleanup', 'emergency-auto-grant', 'emergency-cooldown-reminders', 'contact-reverification']);
