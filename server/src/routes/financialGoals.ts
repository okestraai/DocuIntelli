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
import { createClient } from '@supabase/supabase-js';

const GOALS_CACHE_TTL = 300; // 5 minutes

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
    supabase
      .from('financial_goals')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false }),
    supabase
      .from('financial_goals')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['completed', 'expired']),
    supabase
      .from('in_app_notifications')
      .select('*')
      .eq('user_id', userId)
      .eq('read', false)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  if (goalsResult.error) throw goalsResult.error;

  const goals = goalsResult.data || [];
  const goalIds = goals.map((g: any) => g.id);

  // Phase 2: Fetch accounts + activities in parallel (only if goals exist)
  let goalAccountsMap: Record<string, string[]> = {};
  let goalActivityMap: Record<string, { count: number; total: number }> = {};

  if (goalIds.length > 0) {
    const [accountsResult, activitiesResult] = await Promise.all([
      supabase
        .from('financial_goal_accounts')
        .select('goal_id, account_id')
        .in('goal_id', goalIds),
      supabase
        .from('financial_goal_activities')
        .select('goal_id, amount')
        .in('goal_id', goalIds),
    ]);

    for (const ga of accountsResult.data || []) {
      if (!goalAccountsMap[ga.goal_id]) goalAccountsMap[ga.goal_id] = [];
      goalAccountsMap[ga.goal_id].push(ga.account_id);
    }

    for (const a of activitiesResult.data || []) {
      if (!goalActivityMap[a.goal_id]) goalActivityMap[a.goal_id] = { count: 0, total: 0 };
      goalActivityMap[a.goal_id].count++;
      goalActivityMap[a.goal_id].total += parseFloat(a.amount);
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
    archived_count: archivedResult.count || 0,
    notifications: notifsResult.data || [],
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

    const { data: goals, error } = await supabase
      .from('financial_goals')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['completed', 'expired'])
      .order('completed_at', { ascending: false, nullsFirst: false });

    if (error) throw error;

    // Get linked accounts
    const goalIds = (goals || []).map(g => g.id);
    let goalAccountsMap: Record<string, string[]> = {};

    if (goalIds.length > 0) {
      const { data: goalAccounts } = await supabase
        .from('financial_goal_accounts')
        .select('goal_id, account_id')
        .in('goal_id', goalIds);

      for (const ga of goalAccounts || []) {
        if (!goalAccountsMap[ga.goal_id]) goalAccountsMap[ga.goal_id] = [];
        goalAccountsMap[ga.goal_id].push(ga.account_id);
      }
    }

    res.json(
      (goals || []).map(g => ({ ...g, linked_account_ids: goalAccountsMap[g.id] || [] }))
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
      const { count } = await supabase
        .from('plaid_accounts')
        .select('account_id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('account_id', accountIds);

      if ((count || 0) !== accountIds.length) {
        res.status(400).json({ error: 'One or more linked accounts do not belong to you' });
        return;
      }
    }

    // Calculate baseline for savings/debt goals
    const baseline = await calculateBaseline(userId, goal_type, accountIds);

    // Insert goal
    const { data: goal, error } = await supabase
      .from('financial_goals')
      .insert({
        user_id: userId,
        goal_type,
        name,
        description: description || null,
        target_amount,
        target_date,
        period_type: goal_type === 'spending_limit' ? (period_type || 'monthly') : null,
        baseline_amount: baseline,
      })
      .select()
      .single();

    if (error) throw error;

    // Insert linked accounts
    if (accountIds.length > 0) {
      await supabase.from('financial_goal_accounts').insert(
        accountIds.map(accountId => ({
          goal_id: goal.id,
          account_id: accountId,
          user_id: userId,
        }))
      );
    }

    await invalidateGoalsCache(userId);

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
    const { data: existing } = await supabase
      .from('financial_goals')
      .select('id, status')
      .eq('id', goalId)
      .eq('user_id', userId)
      .single();

    if (!existing) {
      res.status(404).json({ error: 'Goal not found' });
      return;
    }

    if (existing.status !== 'active') {
      res.status(400).json({ error: 'Can only update active goals' });
      return;
    }

    // Build update object
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (target_amount !== undefined) {
      if (target_amount <= 0) {
        res.status(400).json({ error: 'target_amount must be positive' });
        return;
      }
      updates.target_amount = target_amount;
    }
    if (target_date !== undefined) updates.target_date = target_date;

    const { data: updated, error } = await supabase
      .from('financial_goals')
      .update(updates)
      .eq('id', goalId)
      .select()
      .single();

    if (error) throw error;

    // Update linked accounts if provided
    if (linked_account_ids !== undefined) {
      // Remove existing links
      await supabase.from('financial_goal_accounts').delete().eq('goal_id', goalId);

      // Insert new links
      if (linked_account_ids.length > 0) {
        await supabase.from('financial_goal_accounts').insert(
          linked_account_ids.map((accountId: string) => ({
            goal_id: goalId,
            account_id: accountId,
            user_id: userId,
          }))
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

    const { error } = await supabase
      .from('financial_goals')
      .delete()
      .eq('id', goalId)
      .eq('user_id', userId);

    if (error) throw error;

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

    const { data, error } = await supabase
      .from('financial_goals')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', goalId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .select()
      .single();

    if (error) throw error;
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

    const { data, error } = await supabase
      .from('in_app_notifications')
      .select('*')
      .eq('user_id', userId)
      .eq('read', false)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;
    res.json(data || []);
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

    const { error } = await supabase
      .from('in_app_notifications')
      .update({ read: true })
      .eq('id', notificationId)
      .eq('user_id', userId);

    if (error) throw error;
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

    const { error } = await supabase
      .from('in_app_notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) throw error;
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
    const { data: goal } = await supabase
      .from('financial_goals')
      .select('id')
      .eq('id', goalId)
      .eq('user_id', userId)
      .single();

    if (!goal) {
      res.status(404).json({ error: 'Goal not found' });
      return;
    }

    const { data: activities, error, count } = await supabase
      .from('financial_goal_activities')
      .select('*', { count: 'exact' })
      .eq('goal_id', goalId)
      .eq('user_id', userId)
      .order('activity_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({ activities: activities || [], total: count || 0 });
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
    const { data: goal } = await supabase
      .from('financial_goals')
      .select('id, status, start_date, user_id')
      .eq('id', goalId)
      .eq('user_id', userId)
      .single();

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
    const { data: activity, error } = await supabase
      .from('financial_goal_activities')
      .insert({
        goal_id: goalId,
        user_id: userId,
        amount: parsedAmount,
        description: description?.trim() || null,
        activity_date: dateToUse,
      })
      .select()
      .single();

    if (error) throw error;

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
    const { data: activity } = await supabase
      .from('financial_goal_activities')
      .select('id')
      .eq('id', activityId)
      .eq('goal_id', goalId)
      .eq('user_id', userId)
      .single();

    if (!activity) {
      res.status(404).json({ error: 'Activity not found' });
      return;
    }

    const { error } = await supabase
      .from('financial_goal_activities')
      .delete()
      .eq('id', activityId)
      .eq('user_id', userId);

    if (error) throw error;

    // Recalculate goal progress and invalidate cache
    await recalculateAllUserGoals(userId);
    await invalidateGoalsCache(userId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting goal activity:', error);
    res.status(500).json({ error: 'Failed to delete activity' });
  }
});

export default router;
