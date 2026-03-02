// src/lib/adminApi.ts
// Admin API client helpers

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

async function getToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  return session.access_token;
}

async function adminFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}/api/admin${path}`, {
    ...options,
    headers: {
      ...backendHeaders(token),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

// ── Types ────────────────────────────────────────────────────

export interface DashboardStats {
  total_users: number;
  active_this_week: number;
  new_this_month: number;
  plan_free: number;
  plan_starter: number;
  plan_pro: number;
  total_documents: number;
  processing_queue: number;
  total_chunks: number;
  docs_without_chunks: number;
  docs_by_category: Record<string, number>;
  docs_by_health: Record<string, number>;
  dunning_past_due: number;
  dunning_restricted: number;
  dunning_downgraded: number;
  churn_risk: number;
  deletion_scheduled: number;
  total_bank_connections: number;
  total_revenue_cents: number;
  failed_payments: number;
  emails_sent_24h: number;
  emails_failed_24h: number;
  total_ai_questions_used: number;
  total_devices: number;
  active_devices_7d: number;
  blocked_devices: number;
  total_goals: number;
  total_life_events: number;
  recent_signups: Array<{
    id: string;
    email: string;
    createdAt: string;
    lastSignInAt: string | null;
  }>;
}

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  fullName: string;
  plan: string;
  status: string;
  paymentStatus: string;
  dunningStep: number;
  documentCount: number;
  aiQuestionsUsed: number;
  lastSignInAt: string | null;
  createdAt: string;
}

export interface UserListResponse {
  users: AdminUser[];
  total: number;
  page: number;
  limit: number;
}

export interface UserDetail {
  user: {
    id: string;
    email: string;
    last_sign_in_at: string | null;
    created_at: string;
  };
  profile: any;
  subscription: any;
  documents: Array<{
    id: string;
    name: string;
    category: string;
    status: string;
    health_state: string;
    upload_date: string;
    expiration_date: string | null;
    processed: boolean;
    tags: string[];
  }>;
  devices: Array<{
    id: string;
    device_id: string;
    device_name: string;
    platform: string;
    last_active_at: string;
    is_blocked: boolean;
  }>;
  recent_activity: Array<{
    feature: string;
    metadata: any;
    timestamp: string;
  }>;
  limit_violations: Array<{
    limit_type: string;
    current_value: number;
    limit_value: number;
    timestamp: string;
  }>;
  email_history: Array<{
    notification_type: string;
    status: string;
    error_message: string | null;
    sent_at: string;
  }>;
  bank_connections: Array<{
    institution_name: string;
    connected_at: string;
    last_synced_at: string;
    account_count: number;
  }>;
  dunning_log: Array<{
    step: number;
    action: string;
    details: any;
    created_at: string;
  }>;
  financial_goals: Array<{
    id: string;
    name: string;
    goal_type: string;
    status: string;
    target_amount: number;
    current_amount: number;
  }>;
}

export interface ActivityData {
  recentActivity: Array<{
    userId: string;
    email: string;
    feature: string;
    metadata: any;
    timestamp: string;
  }>;
  featureBreakdown: Record<string, number>;
  violations: Array<{
    userId: string;
    email: string;
    limitType: string;
    currentValue: number;
    limitValue: number;
    timestamp: string;
  }>;
}

export interface SystemHealth {
  processingQueue: {
    pending: number;
    oldestPendingAt: string | null;
  };
  emailDelivery: {
    last24h: { sent: number; failed: number; rate: number };
    last7d: { sent: number; failed: number; rate: number };
    recentErrors: Array<{ type: string; error: string; sentAt: string }>;
  };
  embeddings: {
    totalDocuments: number;
    processedDocuments: number;
    coveragePercent: number;
  };
  dunning: {
    active: number;
    pastDue: number;
    restricted: number;
    downgraded: number;
  };
  plaid: {
    totalItems: number;
    totalAccounts: number;
  };
  devices: {
    total: number;
    active: number;
    blocked: number;
  };
}

export interface AuditLogEntry {
  id: string;
  adminId: string;
  adminEmail: string;
  action: string;
  targetUserId: string | null;
  targetEmail: string | null;
  details: any;
  ipAddress: string | null;
  createdAt: string;
}

// ── API calls ────────────────────────────────────────────────

export async function checkAdminStatus(): Promise<boolean> {
  try {
    await adminFetch('/check');
    return true;
  } catch {
    return false;
  }
}

export async function getAdminDashboard(): Promise<DashboardStats> {
  const res = await adminFetch<{ data: DashboardStats }>('/dashboard');
  return res.data;
}

export async function getAdminUsers(params: {
  page?: number;
  limit?: number;
  search?: string;
  plan?: string;
  status?: string;
}): Promise<UserListResponse> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  if (params.search) query.set('search', params.search);
  if (params.plan) query.set('plan', params.plan);
  if (params.status) query.set('status', params.status);
  const res = await adminFetch<{ data: UserListResponse }>(`/users?${query}`);
  return res.data;
}

export async function getAdminUserDetail(userId: string): Promise<UserDetail> {
  const res = await adminFetch<{ data: UserDetail }>(`/users/${userId}`);
  return res.data;
}

export async function updateUserPlan(userId: string, plan: string): Promise<void> {
  await adminFetch(`/users/${userId}/update-plan`, {
    method: 'POST',
    body: JSON.stringify({ plan }),
  });
}

export async function resetAIQuestions(userId: string): Promise<void> {
  await adminFetch(`/users/${userId}/reset-ai-questions`, { method: 'POST' });
}

export async function unblockDevice(userId: string, deviceId: string): Promise<void> {
  await adminFetch(`/users/${userId}/unblock-device`, {
    method: 'POST',
    body: JSON.stringify({ deviceId }),
  });
}

export async function impersonateUser(userId: string): Promise<{
  access_token: string;
  refresh_token: string;
  impersonation_proof: string;
  user: { id: string; email: string };
}> {
  return adminFetch(`/impersonate/${userId}`, { method: 'POST' });
}

export async function getAdminActivity(params: { hours?: number; feature?: string }): Promise<ActivityData> {
  const query = new URLSearchParams();
  if (params.hours) query.set('hours', String(params.hours));
  if (params.feature) query.set('feature', params.feature);
  const res = await adminFetch<{ data: ActivityData }>(`/activity?${query}`);
  return res.data;
}

export async function getAdminSystemHealth(): Promise<SystemHealth> {
  const res = await adminFetch<{ data: SystemHealth }>('/system/health');
  return res.data;
}

export async function getAdminAuditLog(params: { page?: number; limit?: number }): Promise<{
  logs: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
}> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  const res = await adminFetch<{ data: { logs: AuditLogEntry[]; total: number; page: number; limit: number } }>(`/audit-log?${query}`);
  return res.data;
}
