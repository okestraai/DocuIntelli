/**
 * Financial Goals Routes
 * CRUD for financial goals, AI suggestions, progress recalculation, and in-app notifications.
 */

import { Router, Request, Response } from 'express';
import { loadSubscription } from '../middleware/subscriptionGuard';
import {
  recalculateAllUserGoals,
  calculateBaseline,
  GoalRecord,
} from '../services/goalProgressCalculator';
import { generateGoalSuggestions } from '../services/goalSuggestionEngine';
import { getFinancialSummary } from '../services/plaidService';
import { cacheGet, cacheSet, cacheDel } from '../services/redisClient';
import { sendNotificationEmail } from '../services/emailService';
import { query } from '../services/db';

const GOALS_CACHE_TTL = 300; // 5 minutes

const router = Router();

// All routes require authentication
router.use(loadSubscription);

/** Invalidate goals cache for a user */
async function invalidateGoalsCache(userId: string): Promise<void> {
  await cacheDel(`fin_goals:${userId}`);
}

/** Build the full goals response (goals + notifications + counts). Shared by GET / and POST /recalculate. */
async function buildGoalsResponse(userId: string): Promise<any> {
  // Phase 1: Fetch active goals + archived count + notifications in parallel
  const [goalsResult, archivedResult, notifsResult] = await Promise.all([
    query(
      'SELECT * FROM financial_goals WHERE user_id = $1 AND status = $2 ORDER BY created_at DESC',
      [userId, 'active']
    ),
    query(
      'SELECT COUNT(*) AS count FROM financial_goals WHERE user_id = $1 AND status = ANY($2)',
      [userId, ['completed', 'expired']]
    ),
    query(
      'SELECT * FROM in_app_notifications WHERE user_id = $1 AND read = false ORDER BY created_at DESC LIMIT 20',
      [userId]
    ),
  ]);

  const goals = goalsResult.rows || [];
  const goalIds = goals.map((g: any) => g.id);

  // Phase 2: Fetch accounts + activities in parallel (only if goals exist)
  let goalAccountsMap: Record<string, string[]> = {};
  let goalActivityMap: Record<string, { count: number; total: number }> = {};

  if (goalIds.length > 0) {
    const [accountsResult, activitiesResult] = await Promise.all([
      query(
        'SELECT goal_id, account_id FROM financial_goal_accounts WHERE goal_id = ANY($1)',
        [goalIds]
      ),
      query(
        'SELECT goal_id, amount FROM financial_goal_activities WHERE goal_id = ANY($1)',
        [goalIds]
      ),
    ]);

    for (const ga of accountsResult.rows || []) {
      if (!goalAccountsMap[ga.goal_id]) goalAccountsMap[ga.goal_id] = [];
      goalAccountsMap[ga.goal_id].push(ga.account_id);
    }

    for (const a of activitiesResult.rows || []) {
      if (!goalActivityMap[a.goal_id]) goalActivityMap[a.goal_id] = { count: 0, total: 0 };
      goalActivityMap[a.goal_id].count++;
      goalActivityMap[a.goal_id].total += Number(a.amount) || 0;
    }
  }

  const goalsWithAccounts = goals.map((g: any) => ({
    ...g,
    linked_account_ids: goalAccountsMap[g.id] || [],
    manual_activity_count: goalActivityMap[g.id]?.count || 0,
    manual_activity_total: goalActivityMap[g.id]?.total || 0,
  }));

  return {
    goals: goalsWithAccounts,
    active_count: goalsWithAccounts.length,
    archived_count: parseInt(archivedResult.rows[0]?.count || '0'),
    notifications: notifsResult.rows || [],
  };
}

// ── GET /api/financial/goals ────────────────────────────────
// List active goals with cached progress (includes notifications)
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    // Check cache
    const cached = await cacheGet<any>(`fin_goals:${userId}`);
    if (cached) {
      res.json(cached);
      return;
    }

    const result = await buildGoalsResponse(userId);
    await cacheSet(`fin_goals:${userId}`, result, GOALS_CACHE_TTL);
    res.json(result);
  } catch (error) {
    console.error('Error fetching goals:', error);
    res.status(500).json({ error: 'Failed to fetch goals' });
  }
});

// ── GET /api/financial/goals/history ────────────────────────
// List completed/expired goals
router.get('/history', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    const goalsResult = await query(
      'SELECT * FROM financial_goals WHERE user_id = $1 AND status = ANY($2) ORDER BY completed_at DESC NULLS LAST',
      [userId, ['completed', 'expired']]
    );
    const goals = goalsResult.rows || [];

    // Get linked accounts
    const goalIds = goals.map(g => g.id);
    let goalAccountsMap: Record<string, string[]> = {};

    if (goalIds.length > 0) {
      const goalAccountsResult = await query(
        'SELECT goal_id, account_id FROM financial_goal_accounts WHERE goal_id = ANY($1)',
        [goalIds]
      );

      for (const ga of goalAccountsResult.rows || []) {
        if (!goalAccountsMap[ga.goal_id]) goalAccountsMap[ga.goal_id] = [];
        goalAccountsMap[ga.goal_id].push(ga.account_id);
      }
    }

    res.json(
      goals.map(g => ({ ...g, linked_account_ids: goalAccountsMap[g.id] || [] }))
    );
  } catch (error) {
    console.error('Error fetching goal history:', error);
    res.status(500).json({ error: 'Failed to fetch goal history' });
  }
});

// ── POST /api/financial/goals ───────────────────────────────
// Create a new goal
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const {
      goal_type,
      name,
      description,
      target_amount,
      target_date,
      period_type,
      linked_account_ids,
    } = req.body;

    // Validate required fields
    if (!goal_type || !name || !target_amount || !target_date) {
      res.status(400).json({ error: 'Missing required fields: goal_type, name, target_amount, target_date' });
      return;
    }

    const validTypes = ['savings', 'spending_limit', 'debt_paydown', 'income_target', 'ad_hoc'];
    if (!validTypes.includes(goal_type)) {
      res.status(400).json({ error: `Invalid goal_type. Must be one of: ${validTypes.join(', ')}` });
      return;
    }

    if (target_amount <= 0) {
      res.status(400).json({ error: 'target_amount must be positive' });
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    if (target_date <= today) {
      res.status(400).json({ error: 'target_date must be in the future' });
      return;
    }

    // Validate linked accounts belong to user
    const accountIds: string[] = linked_account_ids || [];
    if (accountIds.length > 0) {
      const countResult = await query(
        'SELECT COUNT(*) AS count FROM plaid_accounts WHERE user_id = $1 AND account_id = ANY($2)',
        [userId, accountIds]
      );
      const count = parseInt(countResult.rows[0]?.count || '0');

      if (count !== accountIds.length) {
        res.status(400).json({ error: 'One or more linked accounts do not belong to you' });
        return;
      }
    }

    // Calculate baseline for savings/debt goals
    const baseline = await calculateBaseline(userId, goal_type, accountIds);

    // Insert goal
    const goalResult = await query(
      `INSERT INTO financial_goals (user_id, goal_type, name, description, target_amount, target_date, period_type, baseline_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        userId, goal_type, name, description || null, target_amount, target_date,
        goal_type === 'spending_limit' ? (period_type || 'monthly') : null,
        baseline,
      ]
    );
    const goal = goalResult.rows[0];

    // Insert linked accounts
    if (accountIds.length > 0) {
      const values = accountIds.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(', ');
      const params = accountIds.flatMap(accountId => [goal.id, accountId, userId]);
      await query(
        `INSERT INTO financial_goal_accounts (goal_id, account_id, user_id) VALUES ${values}`,
        params
      );
    }

    await invalidateGoalsCache(userId);

    // Send goal created email (fire-and-forget)
    const profileResult = await query(
      'SELECT display_name FROM user_profiles WHERE id = $1',
      [userId]
    );
    const profile = profileResult.rows[0];
    sendNotificationEmail(userId, 'goal_created', {
      userName: profile?.display_name || '',
      goalName: name,
      goalType: goal_type,
      targetAmount: target_amount,
      targetDate: target_date,
    }).catch(() => {});

    res.status(201).json({ ...goal, linked_account_ids: accountIds });
  } catch (error) {
    console.error('Error creating goal:', error);
    res.status(500).json({ error: 'Failed to create goal' });
  }
});

// ── PUT /api/financial/goals/:id ────────────────────────────
// Update a goal
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const goalId = req.params.id;
    const { name, description, target_amount, target_date, linked_account_ids } = req.body;

    // Verify ownership
    const existingResult = await query(
      'SELECT id, status FROM financial_goals WHERE id = $1 AND user_id = $2',
      [goalId, userId]
    );
    const existing = existingResult.rows[0];

    if (!existing) {
      res.status(404).json({ error: 'Goal not found' });
      return;
    }

    if (existing.status !== 'active') {
      res.status(400).json({ error: 'Can only update active goals' });
      return;
    }

    // Build update dynamically
    const setClauses: string[] = ['updated_at = $1'];
    const params: any[] = [new Date().toISOString()];
    let paramIdx = 2;

    if (name !== undefined) {
      setClauses.push(`name = $${paramIdx}`);
      params.push(name);
      paramIdx++;
    }
    if (description !== undefined) {
      setClauses.push(`description = $${paramIdx}`);
      params.push(description);
      paramIdx++;
    }
    if (target_amount !== undefined) {
      if (target_amount <= 0) {
        res.status(400).json({ error: 'target_amount must be positive' });
        return;
      }
      setClauses.push(`target_amount = $${paramIdx}`);
      params.push(target_amount);
      paramIdx++;
    }
    if (target_date !== undefined) {
      setClauses.push(`target_date = $${paramIdx}`);
      params.push(target_date);
      paramIdx++;
    }

    params.push(goalId);
    const updatedResult = await query(
      `UPDATE financial_goals SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      params
    );
    const updated = updatedResult.rows[0];

    // Update linked accounts if provided
    if (linked_account_ids !== undefined) {
      // Remove existing links
      await query('DELETE FROM financial_goal_accounts WHERE goal_id = $1', [goalId]);

      // Insert new links
      if (linked_account_ids.length > 0) {
        const values = linked_account_ids.map((_: string, i: number) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(', ');
        const linkParams = linked_account_ids.flatMap((accountId: string) => [goalId, accountId, userId]);
        await query(
          `INSERT INTO financial_goal_accounts (goal_id, account_id, user_id) VALUES ${values}`,
          linkParams
        );
      }
    }

    await invalidateGoalsCache(userId);
    res.json({ ...updated, linked_account_ids: linked_account_ids || [] });
  } catch (error) {
    console.error('Error updating goal:', error);
    res.status(500).json({ error: 'Failed to update goal' });
  }
});

// ── DELETE /api/financial/goals/:id ─────────────────────────
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const goalId = req.params.id;

    await query(
      'DELETE FROM financial_goals WHERE id = $1 AND user_id = $2',
      [goalId, userId]
    );

    await invalidateGoalsCache(userId);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting goal:', error);
    res.status(500).json({ error: 'Failed to delete goal' });
  }
});

// ── POST /api/financial/goals/:id/archive ───────────────────
router.post('/:id/archive', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const goalId = req.params.id;

    const archiveResult = await query(
      `UPDATE financial_goals SET status = 'completed', completed_at = $1, updated_at = $1
       WHERE id = $2 AND user_id = $3 AND status = 'active'
       RETURNING *`,
      [new Date().toISOString(), goalId, userId]
    );
    const data = archiveResult.rows[0];

    if (!data) {
      res.status(404).json({ error: 'Active goal not found' });
      return;
    }

    await invalidateGoalsCache(userId);
    res.json(data);
  } catch (error) {
    console.error('Error archiving goal:', error);
    res.status(500).json({ error: 'Failed to archive goal' });
  }
});

// ── POST /api/financial/goals/recalculate ───────────────────
// Recalculate all active goals and return full combined response
router.post('/recalculate', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    await recalculateAllUserGoals(userId);

    // Rebuild and cache the full response so subsequent GET / is instant
    const result = await buildGoalsResponse(userId);
    await cacheSet(`fin_goals:${userId}`, result, GOALS_CACHE_TTL);
    res.json(result);
  } catch (error) {
    console.error('Error recalculating goals:', error);
    res.status(500).json({ error: 'Failed to recalculate goals' });
  }
});

// ── GET /api/financial/goals/suggestions ────────────────────
// AI-powered goal suggestions
router.get('/suggestions', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const summary = await getFinancialSummary(userId);
    const suggestions = await generateGoalSuggestions(summary);
    res.json(suggestions);
  } catch (error) {
    console.error('Error generating goal suggestions:', error);
    res.status(500).json({ error: 'Failed to generate goal suggestions' });
  }
});

// ── GET /api/financial/notifications ────────────────────────
// Get unread in-app notifications
router.get('/notifications', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    const result = await query(
      'SELECT * FROM in_app_notifications WHERE user_id = $1 AND read = false ORDER BY created_at DESC LIMIT 20',
      [userId]
    );

    res.json(result.rows || []);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// ── POST /api/financial/notifications/:id/read ──────────────
router.post('/notifications/:id/read', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const notificationId = req.params.id;

    await query(
      'UPDATE in_app_notifications SET read = true WHERE id = $1 AND user_id = $2',
      [notificationId, userId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking notification read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// ── POST /api/financial/notifications/read-all ──────────────
router.post('/notifications/read-all', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    await query(
      'UPDATE in_app_notifications SET read = true WHERE user_id = $1 AND read = false',
      [userId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking all notifications read:', error);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

// ── GET /api/financial/goals/:id/activities ──────────────────
// List manual activities for a goal
router.get('/:id/activities', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const goalId = req.params.id;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    // Verify goal ownership
    const goalResult = await query(
      'SELECT id FROM financial_goals WHERE id = $1 AND user_id = $2',
      [goalId, userId]
    );

    if (!goalResult.rows[0]) {
      res.status(404).json({ error: 'Goal not found' });
      return;
    }

    const activitiesResult = await query(
      'SELECT * FROM financial_goal_activities WHERE goal_id = $1 AND user_id = $2 ORDER BY activity_date DESC, created_at DESC LIMIT $3 OFFSET $4',
      [goalId, userId, limit, offset]
    );

    const countResult = await query(
      'SELECT COUNT(*) AS count FROM financial_goal_activities WHERE goal_id = $1 AND user_id = $2',
      [goalId, userId]
    );

    res.json({
      activities: activitiesResult.rows || [],
      total: parseInt(countResult.rows[0]?.count || '0'),
    });
  } catch (error) {
    console.error('Error fetching goal activities:', error);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

// ── POST /api/financial/goals/:id/activities ─────────────────
// Log a new manual activity
router.post('/:id/activities', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const goalId = req.params.id;
    const { amount, description, activity_date } = req.body;

    // Validate amount
    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      res.status(400).json({ error: 'Amount must be a positive number' });
      return;
    }

    // Verify goal ownership and active status
    const goalResult = await query(
      'SELECT id, status, start_date, user_id FROM financial_goals WHERE id = $1 AND user_id = $2',
      [goalId, userId]
    );
    const goal = goalResult.rows[0];

    if (!goal) {
      res.status(404).json({ error: 'Goal not found' });
      return;
    }

    if (goal.status !== 'active') {
      res.status(400).json({ error: 'Can only log activities on active goals' });
      return;
    }

    // Validate activity_date if provided
    const today = new Date().toISOString().split('T')[0];
    const dateToUse = activity_date || today;

    if (dateToUse > today) {
      res.status(400).json({ error: 'Activity date cannot be in the future' });
      return;
    }

    if (dateToUse < goal.start_date) {
      res.status(400).json({ error: 'Activity date cannot be before the goal start date' });
      return;
    }

    // Insert activity
    const activityResult = await query(
      `INSERT INTO financial_goal_activities (goal_id, user_id, amount, description, activity_date)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [goalId, userId, parsedAmount, description?.trim() || null, dateToUse]
    );
    const activity = activityResult.rows[0];

    // Recalculate goal progress and invalidate cache
    await recalculateAllUserGoals(userId);
    await invalidateGoalsCache(userId);

    res.status(201).json(activity);
  } catch (error) {
    console.error('Error logging goal activity:', error);
    res.status(500).json({ error: 'Failed to log activity' });
  }
});

// ── DELETE /api/financial/goals/:id/activities/:activityId ────
// Delete a manual activity
router.delete('/:id/activities/:activityId', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const goalId = req.params.id;
    const activityId = req.params.activityId;

    // Verify ownership of both goal and activity
    const activityResult = await query(
      'SELECT id FROM financial_goal_activities WHERE id = $1 AND goal_id = $2 AND user_id = $3',
      [activityId, goalId, userId]
    );

    if (!activityResult.rows[0]) {
      res.status(404).json({ error: 'Activity not found' });
      return;
    }

    await query(
      'DELETE FROM financial_goal_activities WHERE id = $1 AND user_id = $2',
      [activityId, userId]
    );

    // Recalculate goal progress and invalidate cache
    await recalculateAllUserGoals(userId);
    await invalidateGoalsCache(userId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting goal activity:', error);
    res.status(500).json({ error: 'Failed to delete activity' });
  }
});

// ── POST /api/financial/goals/check-deadlines ───────────────
// Cron-triggered: send reminder emails for goals due within 7 days
router.post('/check-deadlines', async (req: Request, res: Response) => {
  try {
    const today = new Date();
    const sevenDaysOut = new Date(today.getTime() + 7 * 86400000).toISOString().split('T')[0];
    const todayStr = today.toISOString().split('T')[0];

    // Find active goals with target_date within 7 days
    const goalsResult = await query(
      'SELECT id, user_id, name, target_amount, current_amount, target_date FROM financial_goals WHERE status = $1 AND target_date >= $2 AND target_date <= $3',
      ['active', todayStr, sevenDaysOut]
    );
    const goals = goalsResult.rows;

    if (!goals || goals.length === 0) {
      res.json({ success: true, sent: 0 });
      return;
    }

    let sent = 0;
    for (const goal of goals) {
      // Deduplicate: check if we already notified about this goal's deadline
      const existingResult = await query(
        'SELECT id FROM notification_logs WHERE user_id = $1 AND notification_type = $2 AND sent_at >= $3 LIMIT 1',
        [goal.user_id, 'goal_deadline_approaching', new Date(today.getTime() - 3 * 86400000).toISOString()]
      );
      if (existingResult.rows[0]) continue;

      const daysUntil = Math.ceil(
        (new Date(goal.target_date).getTime() - today.getTime()) / 86400000
      );
      const targetAmt = Number(goal.target_amount) || 0;
      const currentAmt = Number(goal.current_amount) || 0;
      const progressPct = targetAmt > 0
        ? Math.round((currentAmt / targetAmt) * 100)
        : 0;

      const profileResult = await query(
        'SELECT display_name FROM user_profiles WHERE id = $1',
        [goal.user_id]
      );
      const profile = profileResult.rows[0];

      await sendNotificationEmail(goal.user_id, 'goal_deadline_approaching', {
        userName: profile?.display_name || '',
        goalName: goal.name,
        daysUntil,
        progressPct,
        currentAmount: currentAmt,
        targetAmount: targetAmt,
      });
      sent++;
    }

    res.json({ success: true, sent, checked: goals.length });
  } catch (error) {
    console.error('Error checking goal deadlines:', error);
    res.status(500).json({ error: 'Failed to check deadlines' });
  }
});

export default router;
