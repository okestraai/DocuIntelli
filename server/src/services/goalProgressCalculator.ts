/**
 * Goal Progress Calculator
 * Calculates real-time progress for financial goals based on linked account data.
 * Handles milestone detection and notification creation.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Account types where the balance represents money OWED (liabilities)
const LIABILITY_TYPES = new Set(['credit', 'loan']);



export interface GoalRecord {
  id: string;
  user_id: string;
  goal_type: string;
  name: string;
  target_amount: number;
  current_amount: number;
  start_date: string;
  target_date: string;
  status: string;
  period_type: string | null;
  baseline_amount: number | null;
  milestones_notified: { '50': boolean; '75': boolean; '100': boolean };
  linked_account_ids?: string[];
}

interface AccountData {
  account_id: string;
  name: string;
  type: string;
  subtype: string;
  initial_balance: number;
}

interface TransactionData {
  account_id: string;
  amount: number;
  date: string;
  pending: boolean;
}

interface ProgressResult {
  current_amount: number;
  progress_pct: number;
}

/**
 * Calculate current balance for an account from initial_balance and transactions.
 * Matches the logic in plaidService.getFinancialSummary().
 */
function calculateAccountBalance(account: AccountData, transactions: TransactionData[]): number {
  const acctTxns = transactions.filter(t => t.account_id === account.account_id);
  // Plaid amounts: positive = money out, negative = money in
  const txnSum = acctTxns.reduce((sum, t) => sum + t.amount, 0);
  const rawBalance = (account.initial_balance || 0) - txnSum;
  const isLiability = LIABILITY_TYPES.has(account.type);
  return isLiability ? -Math.abs(rawBalance) : rawBalance;
}

/**
 * Get the start of the current period for spending limit goals.
 */
function getPeriodStart(periodType: string): string {
  const now = new Date();
  switch (periodType) {
    case 'weekly': {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday start
      const monday = new Date(now.getFullYear(), now.getMonth(), diff);
      return monday.toISOString().split('T')[0];
    }
    case 'yearly': {
      return `${now.getFullYear()}-01-01`;
    }
    case 'monthly':
    default: {
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    }
  }
}

/**
 * Calculate progress for a single goal based on account data, transactions,
 * and any manually logged activity amounts.
 */
export function calculateGoalProgress(
  goal: GoalRecord,
  accounts: AccountData[],
  transactions: TransactionData[],
  manualAmount: number = 0
): ProgressResult {
  const linkedAccountIds = goal.linked_account_ids || [];
  const linkedAccounts = accounts.filter(a => linkedAccountIds.includes(a.account_id));
  const linkedTxns = transactions.filter(t => linkedAccountIds.includes(t.account_id) && !t.pending);

  if (linkedAccounts.length === 0 && goal.goal_type !== 'ad_hoc') {
    // No linked accounts — manual amount is the only progress source
    const amt = Math.round(manualAmount * 100) / 100;
    const pct = goal.target_amount > 0
      ? Math.min(Math.round((amt / goal.target_amount) * 10000) / 100, 999)
      : 0;
    return { current_amount: amt, progress_pct: pct };
  }

  let currentAmount = 0;

  switch (goal.goal_type) {
    case 'savings': {
      // Track balance growth on linked depository accounts since goal creation
      const totalBalance = linkedAccounts
        .filter(a => !LIABILITY_TYPES.has(a.type))
        .reduce((sum, a) => sum + calculateAccountBalance(a, linkedTxns), 0);
      currentAmount = totalBalance - (goal.baseline_amount || 0) + manualAmount;
      currentAmount = Math.max(0, currentAmount);
      break;
    }

    case 'spending_limit': {
      // Sum expenses in the current period from linked accounts
      const periodStart = getPeriodStart(goal.period_type || 'monthly');
      const periodTxns = linkedTxns.filter(t => t.date >= periodStart && t.amount > 0);
      currentAmount = periodTxns.reduce((sum, t) => sum + t.amount, 0) + manualAmount;
      break;
    }

    case 'debt_paydown': {
      // Track balance reduction on credit/loan accounts
      const totalDebt = linkedAccounts
        .filter(a => LIABILITY_TYPES.has(a.type))
        .reduce((sum, a) => sum + Math.abs(calculateAccountBalance(a, linkedTxns)), 0);
      currentAmount = (goal.baseline_amount || 0) - totalDebt + manualAmount;
      currentAmount = Math.max(0, currentAmount);
      break;
    }

    case 'income_target': {
      // Sum income (negative Plaid amounts = money in) within the goal's date range
      const incomeTxns = linkedTxns.filter(
        t => t.amount < 0 && t.date >= goal.start_date && t.date <= goal.target_date
      );
      currentAmount = incomeTxns.reduce((sum, t) => sum + Math.abs(t.amount), 0) + manualAmount;
      break;
    }

    case 'ad_hoc': {
      // Balance-based: sum current balance of linked accounts + manual entries
      if (linkedAccounts.length > 0) {
        currentAmount = linkedAccounts.reduce(
          (sum, a) => sum + calculateAccountBalance(a, linkedTxns), 0
        ) + manualAmount;
      } else {
        currentAmount = manualAmount;
      }
      break;
    }
  }

  currentAmount = Math.round(currentAmount * 100) / 100;
  const progressPct = goal.target_amount > 0
    ? Math.min(Math.round((currentAmount / goal.target_amount) * 10000) / 100, 999)
    : 0;

  return { current_amount: currentAmount, progress_pct: progressPct };
}

/**
 * Calculate the initial baseline amount for a new goal based on linked accounts.
 */
export async function calculateBaseline(
  userId: string,
  goalType: string,
  linkedAccountIds: string[]
): Promise<number> {
  if (linkedAccountIds.length === 0) return 0;

  const [{ data: accounts }, { data: transactions }] = await Promise.all([
    supabase.from('plaid_accounts').select('*').eq('user_id', userId).in('account_id', linkedAccountIds),
    supabase.from('plaid_transactions').select('*').eq('user_id', userId).in('account_id', linkedAccountIds).eq('pending', false),
  ]);

  if (!accounts || accounts.length === 0) return 0;
  const txns = transactions || [];

  switch (goalType) {
    case 'savings': {
      // Baseline = current total balance of linked depository accounts
      return accounts
        .filter(a => !LIABILITY_TYPES.has(a.type))
        .reduce((sum, a) => sum + calculateAccountBalance(a, txns), 0);
    }
    case 'debt_paydown': {
      // Baseline = current total debt on linked credit/loan accounts
      return accounts
        .filter(a => LIABILITY_TYPES.has(a.type))
        .reduce((sum, a) => sum + Math.abs(calculateAccountBalance(a, txns)), 0);
    }
    default:
      return 0;
  }
}

/**
 * Check if milestone thresholds have been crossed and create notifications.
 */
async function checkAndNotifyMilestones(
  goal: GoalRecord,
  newProgressPct: number
): Promise<void> {
  const milestones = goal.milestones_notified;
  const notifications: Array<{ type: string; title: string; message: string; metadata: any }> = [];

  // For spending_limit, milestones don't apply in the normal sense (lower is better)
  if (goal.goal_type === 'spending_limit') return;

  // Check 50% milestone
  if (newProgressPct >= 50 && !milestones['50']) {
    milestones['50'] = true;
    notifications.push({
      type: 'goal_milestone',
      title: 'Halfway there!',
      message: `You've reached 50% of your "${goal.name}" goal. Keep up the great work!`,
      metadata: { goal_id: goal.id, milestone_pct: 50 },
    });
  }

  // Check 75% milestone
  if (newProgressPct >= 75 && !milestones['75']) {
    milestones['75'] = true;
    notifications.push({
      type: 'goal_milestone',
      title: 'Almost there!',
      message: `You're 75% of the way to your "${goal.name}" goal. The finish line is in sight!`,
      metadata: { goal_id: goal.id, milestone_pct: 75 },
    });
  }

  // Check 100% (completion)
  if (newProgressPct >= 100 && !milestones['100']) {
    milestones['100'] = true;
    notifications.push({
      type: 'goal_completed',
      title: 'Goal achieved!',
      message: `Congratulations! You've completed your "${goal.name}" goal. What an accomplishment!`,
      metadata: { goal_id: goal.id, milestone_pct: 100 },
    });
  }

  if (notifications.length === 0) return;

  // Insert notifications
  await supabase.from('in_app_notifications').insert(
    notifications.map(n => ({ user_id: goal.user_id, ...n }))
  );

  // Update milestones_notified
  await supabase
    .from('financial_goals')
    .update({ milestones_notified: milestones, updated_at: new Date().toISOString() })
    .eq('id', goal.id);

  // If completed, mark the goal as completed
  if (milestones['100']) {
    await supabase
      .from('financial_goals')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', goal.id);
  }
}

/**
 * Recalculate progress for all active goals of a user.
 * Called on page load and after transaction syncs.
 */
export async function recalculateAllUserGoals(userId: string): Promise<GoalRecord[]> {
  // Expire overdue goals first
  await expireOverdueGoals(userId);

  // Fetch all active goals with their linked accounts
  const { data: goals } = await supabase
    .from('financial_goals')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (!goals || goals.length === 0) return [];

  // Fetch linked account IDs for all goals
  const goalIds = goals.map(g => g.id);
  const { data: goalAccounts } = await supabase
    .from('financial_goal_accounts')
    .select('goal_id, account_id')
    .in('goal_id', goalIds);

  const accountsByGoal = new Map<string, string[]>();
  for (const ga of goalAccounts || []) {
    if (!accountsByGoal.has(ga.goal_id)) accountsByGoal.set(ga.goal_id, []);
    accountsByGoal.get(ga.goal_id)!.push(ga.account_id);
  }

  // Get all unique linked account IDs
  const allAccountIds = [...new Set((goalAccounts || []).map(ga => ga.account_id))];

  // Fetch account/transaction data and manual activity sums in parallel
  const [accountsResult, transactionsResult, activitiesResult] = await Promise.all([
    allAccountIds.length > 0
      ? supabase.from('plaid_accounts').select('*').eq('user_id', userId).in('account_id', allAccountIds)
      : Promise.resolve({ data: [] as any[] }),
    allAccountIds.length > 0
      ? supabase.from('plaid_transactions').select('*').eq('user_id', userId).in('account_id', allAccountIds).eq('pending', false)
      : Promise.resolve({ data: [] as any[] }),
    supabase.from('financial_goal_activities').select('goal_id, amount, activity_date').in('goal_id', goalIds),
  ]);

  const accts = accountsResult.data || [];
  const txns = transactionsResult.data || [];

  // Build manual activity sums per goal (total and period-filtered for spending_limit)
  const manualSumsByGoal = new Map<string, number>();
  const manualPeriodSumsByGoal = new Map<string, Map<string, number>>(); // goalId → periodStart → sum
  for (const a of activitiesResult.data || []) {
    const prev = manualSumsByGoal.get(a.goal_id) || 0;
    manualSumsByGoal.set(a.goal_id, prev + parseFloat(a.amount));
    // Also store by date for period filtering
    if (!manualPeriodSumsByGoal.has(a.goal_id)) manualPeriodSumsByGoal.set(a.goal_id, new Map());
    // We'll filter later per goal
  }

  // For spending_limit goals, compute period-filtered manual sums
  const rawActivities = activitiesResult.data || [];

  // Recalculate each goal — collect dirty updates for batching
  const updatedGoals: GoalRecord[] = [];
  const dirtyGoals: Array<{ id: string; current_amount: number }> = [];
  const now = new Date().toISOString();

  for (const goal of goals) {
    const linkedIds = accountsByGoal.get(goal.id) || [];
    const goalWithAccounts: GoalRecord = { ...goal, linked_account_ids: linkedIds };

    // Get manual amount — for spending_limit, filter by current period
    let manualSum = 0;
    if (goal.goal_type === 'spending_limit') {
      const periodStart = getPeriodStart(goal.period_type || 'monthly');
      manualSum = rawActivities
        .filter(a => a.goal_id === goal.id && a.activity_date >= periodStart)
        .reduce((sum: number, a: any) => sum + parseFloat(a.amount), 0);
    } else {
      manualSum = manualSumsByGoal.get(goal.id) || 0;
    }

    const { current_amount, progress_pct } = calculateGoalProgress(goalWithAccounts, accts, txns, manualSum);

    // Collect dirty goals for batch update
    if (Math.abs(current_amount - goal.current_amount) > 0.01) {
      dirtyGoals.push({ id: goal.id, current_amount });
    }

    // Check milestones (may create notifications / complete goals)
    await checkAndNotifyMilestones(goalWithAccounts, progress_pct);

    updatedGoals.push({
      ...goalWithAccounts,
      current_amount,
      status: progress_pct >= 100 && goal.goal_type !== 'spending_limit' ? 'completed' : goal.status,
    });
  }

  // Batch update dirty goals — use individual updates (safe, no RPC dependency)
  if (dirtyGoals.length > 0) {
    await Promise.all(
      dirtyGoals.map(g =>
        supabase
          .from('financial_goals')
          .update({ current_amount: g.current_amount, updated_at: now })
          .eq('id', g.id)
      )
    );
  }

  return updatedGoals;
}

/**
 * Mark active goals past their target date as expired.
 */
async function expireOverdueGoals(userId: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  const { data: expired } = await supabase
    .from('financial_goals')
    .select('id, name, user_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .lt('target_date', today);

  if (!expired || expired.length === 0) return;

  const now = new Date().toISOString();

  // Update all expired goals
  await supabase
    .from('financial_goals')
    .update({ status: 'expired', expired_at: now, updated_at: now })
    .eq('user_id', userId)
    .eq('status', 'active')
    .lt('target_date', today);

  // Create expiration notifications
  const notifications = expired.map(g => ({
    user_id: g.user_id,
    type: 'goal_expired',
    title: 'Goal expired',
    message: `Your "${g.name}" goal has passed its target date. You can view it in your goal history.`,
    metadata: { goal_id: g.id },
  }));

  await supabase.from('in_app_notifications').insert(notifications);
}
