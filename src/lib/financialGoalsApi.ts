/**
 * Financial Goals API helpers
 */
import { supabase } from './supabase';
import { getDeviceId } from './deviceId';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

function backendHeaders(accessToken: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'X-Device-ID': getDeviceId(),
  };
}

async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  return session;
}

// ── Types ───────────────────────────────────────────────────

export type GoalType = 'savings' | 'spending_limit' | 'debt_paydown' | 'income_target' | 'ad_hoc';
export type GoalStatus = 'active' | 'completed' | 'expired';

export interface FinancialGoal {
  id: string;
  user_id: string;
  goal_type: GoalType;
  name: string;
  description: string | null;
  target_amount: number;
  current_amount: number;
  start_date: string;
  target_date: string;
  status: GoalStatus;
  period_type: string | null;
  baseline_amount: number | null;
  milestones_notified: { '50': boolean; '75': boolean; '100': boolean };
  completed_at: string | null;
  expired_at: string | null;
  created_at: string;
  updated_at: string;
  linked_account_ids: string[];
  manual_activity_count?: number;
  manual_activity_total?: number;
}

export interface GoalActivity {
  id: string;
  goal_id: string;
  user_id: string;
  amount: number;
  description: string | null;
  activity_date: string;
  created_at: string;
}

export interface CreateActivityRequest {
  amount: number;
  description?: string;
  activity_date?: string;
}

export interface GoalSuggestion {
  goal_type: GoalType;
  name: string;
  suggested_target: number;
  suggested_date: string;
  reasoning: string;
  linked_account_ids: string[];
}

export interface InAppNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  metadata: Record<string, any>;
  read: boolean;
  created_at: string;
}

export interface CreateGoalRequest {
  goal_type: GoalType;
  name: string;
  description?: string;
  target_amount: number;
  target_date: string;
  period_type?: string;
  linked_account_ids: string[];
}

export interface UpdateGoalRequest {
  name?: string;
  description?: string;
  target_amount?: number;
  target_date?: string;
  linked_account_ids?: string[];
}

/** Combined goals response (goals + notifications + counts — single API call) */
export interface GoalsResponse {
  goals: FinancialGoal[];
  active_count: number;
  archived_count: number;
  notifications: InAppNotification[];
}

// ── API Functions ───────────────────────────────────────────

/** Fetch active goals with counts and notifications (single call) */
export async function getGoals(): Promise<GoalsResponse> {
  const session = await getSession();
  const res = await fetch(`${API_BASE}/api/financial/goals`, {
    headers: backendHeaders(session.access_token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to fetch goals' }));
    throw new Error(err.error || err.message);
  }
  return res.json();
}

/** Fetch archived (completed/expired) goals */
export async function getGoalHistory(): Promise<FinancialGoal[]> {
  const session = await getSession();
  const res = await fetch(`${API_BASE}/api/financial/goals/history`, {
    headers: backendHeaders(session.access_token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to fetch goal history' }));
    throw new Error(err.error || err.message);
  }
  return res.json();
}

/** Create a new goal */
export async function createGoal(data: CreateGoalRequest): Promise<FinancialGoal> {
  const session = await getSession();
  const res = await fetch(`${API_BASE}/api/financial/goals`, {
    method: 'POST',
    headers: backendHeaders(session.access_token),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to create goal' }));
    throw new Error(err.error || err.message);
  }
  return res.json();
}

/** Update an existing goal */
export async function updateGoal(id: string, data: UpdateGoalRequest): Promise<FinancialGoal> {
  const session = await getSession();
  const res = await fetch(`${API_BASE}/api/financial/goals/${id}`, {
    method: 'PUT',
    headers: backendHeaders(session.access_token),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to update goal' }));
    throw new Error(err.error || err.message);
  }
  return res.json();
}

/** Delete a goal */
export async function deleteGoal(id: string): Promise<void> {
  const session = await getSession();
  const res = await fetch(`${API_BASE}/api/financial/goals/${id}`, {
    method: 'DELETE',
    headers: backendHeaders(session.access_token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to delete goal' }));
    throw new Error(err.error || err.message);
  }
}

/** Archive a goal (mark as completed) */
export async function archiveGoal(id: string): Promise<FinancialGoal> {
  const session = await getSession();
  const res = await fetch(`${API_BASE}/api/financial/goals/${id}/archive`, {
    method: 'POST',
    headers: backendHeaders(session.access_token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to archive goal' }));
    throw new Error(err.error || err.message);
  }
  return res.json();
}

/** Recalculate all active goals and return full combined response */
export async function recalculateGoals(): Promise<GoalsResponse> {
  const session = await getSession();
  const res = await fetch(`${API_BASE}/api/financial/goals/recalculate`, {
    method: 'POST',
    headers: backendHeaders(session.access_token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to recalculate goals' }));
    throw new Error(err.error || err.message);
  }
  return res.json();
}

/** Get AI-powered goal suggestions */
export async function getGoalSuggestions(): Promise<GoalSuggestion[]> {
  const session = await getSession();
  const res = await fetch(`${API_BASE}/api/financial/goals/suggestions`, {
    headers: backendHeaders(session.access_token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to get suggestions' }));
    throw new Error(err.error || err.message);
  }
  return res.json();
}

/** Get unread in-app notifications */
export async function getNotifications(): Promise<InAppNotification[]> {
  const session = await getSession();
  const res = await fetch(`${API_BASE}/api/financial/goals/notifications`, {
    headers: backendHeaders(session.access_token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to fetch notifications' }));
    throw new Error(err.error || err.message);
  }
  return res.json();
}

/** Mark a notification as read */
export async function markNotificationRead(id: string): Promise<void> {
  const session = await getSession();
  const res = await fetch(`${API_BASE}/api/financial/goals/notifications/${id}/read`, {
    method: 'POST',
    headers: backendHeaders(session.access_token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to mark notification read' }));
    throw new Error(err.error || err.message);
  }
}

/** Mark all notifications as read */
export async function markAllNotificationsRead(): Promise<void> {
  const session = await getSession();
  const res = await fetch(`${API_BASE}/api/financial/goals/notifications/read-all`, {
    method: 'POST',
    headers: backendHeaders(session.access_token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to mark all notifications read' }));
    throw new Error(err.error || err.message);
  }
}

// ── Activity Logging ───────────────────────────────────────

/** Get manual activities for a goal */
export async function getGoalActivities(goalId: string): Promise<{ activities: GoalActivity[]; total: number }> {
  const session = await getSession();
  const res = await fetch(`${API_BASE}/api/financial/goals/${goalId}/activities`, {
    headers: backendHeaders(session.access_token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to fetch activities' }));
    throw new Error(err.error || err.message);
  }
  return res.json();
}

/** Log a new manual activity */
export async function createGoalActivity(goalId: string, data: CreateActivityRequest): Promise<GoalActivity> {
  const session = await getSession();
  const res = await fetch(`${API_BASE}/api/financial/goals/${goalId}/activities`, {
    method: 'POST',
    headers: backendHeaders(session.access_token),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to log activity' }));
    throw new Error(err.error || err.message);
  }
  return res.json();
}

/** Delete a manual activity */
export async function deleteGoalActivity(goalId: string, activityId: string): Promise<void> {
  const session = await getSession();
  const res = await fetch(`${API_BASE}/api/financial/goals/${goalId}/activities/${activityId}`, {
    method: 'DELETE',
    headers: backendHeaders(session.access_token),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to delete activity' }));
    throw new Error(err.error || err.message);
  }
}
