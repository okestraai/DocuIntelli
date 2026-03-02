/**
 * Goal Progress Calculator
 * Calculates real-time progress for financial goals based on linked account data.
 * Handles milestone detection and notification creation.
 */

import { query } from '../services/db';
import { sendNotificationEmail } from './emailService';

// Account types where the balance represents money OWED (liabilities)
const LIABILITY_TYPES = new Set(['credit', 'loan']);

/** Get user display name for email templates. */
async function getUserDisplayName(userId: string): Promise<string> {
  const result = await query(
    'SELECT display_name FROM user_subscriptions WHERE user_id = $1',
    [userId]
  );
  return result.rows[0]?.display_name || '';
}



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

  // Build parameterized IN clause
  const accountPlaceholders = linkedAccountIds.map((_, i) => `$${i + 2}`).join(', ');

  const [accountsResult, transactionsResult] = await Promise.all([
    query(
      `SELECT * FROM plaid_accounts WHERE user_id = $1 AND account_id IN (${accountPlaceholders})`,
      [userId, ...linkedAccountIds]
    ),
    query(
      `SELECT * FROM plaid_transactions WHERE user_id = $1 AND account_id IN (${accountPlaceholders}) AND pending = false`,
      [userId, ...linkedAccountIds]
    ),
  ]);

  const accounts = accountsResult.rows;
  if (accounts.length === 0) return 0;
  const txns = transactionsResult.rows;

  switch (goalType) {
    case 'savings': {
      // Baseline = current total balance of linked depository accounts
      return accounts
        .filter((a: any) => !LIABILITY_TYPES.has(a.type))
        .reduce((sum: number, a: any) => sum + calculateAccountBalance(a, txns), 0);
    }
    case 'debt_paydown': {
      // Baseline = current total debt on linked credit/loan accounts
      return accounts
        .filter((a: any) => LIABILITY_TYPES.has(a.type))
        .reduce((sum: number, a: any) => sum + Math.abs(calculateAccountBalance(a, txns)), 0);
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

  // Insert notifications — build multi-row VALUES clause
  const values: any[] = [];
  const valueClauses: string[] = [];
  let paramIdx = 1;
  for (const n of notifications) {
    valueClauses.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4})`);
    values.push(goal.user_id, n.type, n.title, n.message, JSON.stringify(n.metadata));
    paramIdx += 5;
  }
  await query(
    `INSERT INTO in_app_notifications (user_id, type, title, message, metadata) VALUES ${valueClauses.join(', ')}`,
    values
  );

  // Update milestones_notified
  await query(
    'UPDATE financial_goals SET milestones_notified = $1, updated_at = $2 WHERE id = $3',
    [JSON.stringify(milestones), new Date().toISOString(), goal.id]
  );

  // Send email notifications (fire-and-forget)
  const userName = await getUserDisplayName(goal.user_id);
  for (const n of notifications) {
    if (n.type === 'goal_milestone') {
      sendNotificationEmail(goal.user_id, 'goal_milestone', {
        userName,
        goalName: goal.name,
        milestonePct: n.metadata.milestone_pct,
        currentAmount: goal.current_amount,
        targetAmount: goal.target_amount,
      }).catch(() => {});
    } else if (n.type === 'goal_completed') {
      sendNotificationEmail(goal.user_id, 'goal_completed', {
        userName,
        goalName: goal.name,
        targetAmount: goal.target_amount,
        completedDate: new Date().toISOString().split('T')[0],
      }).catch(() => {});
    }
  }

  // If completed, mark the goal as completed
  if (milestones['100']) {
    await query(
      'UPDATE financial_goals SET status = $1, completed_at = $2, updated_at = $3 WHERE id = $4',
      ['completed', new Date().toISOString(), new Date().toISOString(), goal.id]
    );
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
  const goalsResult = await query(
    'SELECT * FROM financial_goals WHERE user_id = $1 AND status = $2',
    [userId, 'active']
  );
  const goals = goalsResult.rows;

  if (goals.length === 0) return [];

  // Fetch linked account IDs for all goals
  const goalIds = goals.map((g: any) => g.id);
  const goalIdPlaceholders = goalIds.map((_: any, i: number) => `$${i + 1}`).join(', ');
  const goalAccountsResult = await query(
    `SELECT goal_id, account_id FROM financial_goal_accounts WHERE goal_id IN (${goalIdPlaceholders})`,
    goalIds
  );
  const goalAccounts = goalAccountsResult.rows;

  const accountsByGoal = new Map<string, string[]>();
  for (const ga of goalAccounts) {
    if (!accountsByGoal.has(ga.goal_id)) accountsByGoal.set(ga.goal_id, []);
    accountsByGoal.get(ga.goal_id)!.push(ga.account_id);
  }

  // Get all unique linked account IDs
  const allAccountIds = [...new Set(goalAccounts.map((ga: any) => ga.account_id))];

  // Fetch account/transaction data and manual activity sums in parallel
  const accountIdPlaceholders = allAccountIds.map((_: any, i: number) => `$${i + 2}`).join(', ');

  const [accountsResult, transactionsResult, activitiesResult] = await Promise.all([
    allAccountIds.length > 0
      ? query(
          `SELECT * FROM plaid_accounts WHERE user_id = $1 AND account_id IN (${accountIdPlaceholders})`,
          [userId, ...allAccountIds]
        )
      : Promise.resolve({ rows: [] as any[] }),
    allAccountIds.length > 0
      ? query(
          `SELECT * FROM plaid_transactions WHERE user_id = $1 AND account_id IN (${accountIdPlaceholders}) AND pending = false`,
          [userId, ...allAccountIds]
        )
      : Promise.resolve({ rows: [] as any[] }),
    query(
      `SELECT goal_id, amount, activity_date FROM financial_goal_activities WHERE goal_id IN (${goalIdPlaceholders})`,
      goalIds
    ),
  ]);

  const accts = accountsResult.rows;
  const txns = transactionsResult.rows;

  // Build manual activity sums per goal (total and period-filtered for spending_limit)
  const manualSumsByGoal = new Map<string, number>();
  for (const a of activitiesResult.rows) {
    const prev = manualSumsByGoal.get(a.goal_id) || 0;
    manualSumsByGoal.set(a.goal_id, prev + parseFloat(a.amount));
  }

  // For spending_limit goals, compute period-filtered manual sums
  const rawActivities = activitiesResult.rows;

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
        .filter((a: any) => a.goal_id === goal.id && a.activity_date >= periodStart)
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
        query(
          'UPDATE financial_goals SET current_amount = $1, updated_at = $2 WHERE id = $3',
          [g.current_amount, now, g.id]
        )
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

  const expiredResult = await query(
    'SELECT id, name, user_id FROM financial_goals WHERE user_id = $1 AND status = $2 AND target_date < $3',
    [userId, 'active', today]
  );
  const expired = expiredResult.rows;

  if (expired.length === 0) return;

  const now = new Date().toISOString();

  // Update all expired goals
  await query(
    'UPDATE financial_goals SET status = $1, expired_at = $2, updated_at = $3 WHERE user_id = $4 AND status = $5 AND target_date < $6',
    ['expired', now, now, userId, 'active', today]
  );

  // Create expiration notifications — build multi-row VALUES clause
  const values: any[] = [];
  const valueClauses: string[] = [];
  let paramIdx = 1;
  for (const g of expired) {
    valueClauses.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4})`);
    values.push(
      g.user_id,
      'goal_expired',
      'Goal expired',
      `Your "${g.name}" goal has passed its target date. You can view it in your goal history.`,
      JSON.stringify({ goal_id: g.id })
    );
    paramIdx += 5;
  }
  await query(
    `INSERT INTO in_app_notifications (user_id, type, title, message, metadata) VALUES ${valueClauses.join(', ')}`,
    values
  );

  // Send expiration emails (fire-and-forget)
  for (const g of expired) {
    // Fetch full goal data for email
    const fullGoalResult = await query(
      'SELECT target_date, current_amount, target_amount FROM financial_goals WHERE id = $1',
      [g.id]
    );
    const fullGoal = fullGoalResult.rows[0];
    if (!fullGoal) continue;

    const progressPct = fullGoal.target_amount > 0
      ? Math.round((fullGoal.current_amount / fullGoal.target_amount) * 100)
      : 0;
    const userName = await getUserDisplayName(g.user_id);

    sendNotificationEmail(g.user_id, 'goal_expired', {
      userName,
      goalName: g.name,
      targetDate: fullGoal.target_date,
      progressPct,
      currentAmount: fullGoal.current_amount,
      targetAmount: fullGoal.target_amount,
    }).catch(() => {});
  }
}
