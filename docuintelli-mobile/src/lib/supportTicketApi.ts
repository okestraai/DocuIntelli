/**
 * Mobile API client for Support Tickets
 */
import { auth } from './auth';
import { API_BASE } from './config';
import { getDeviceId } from './deviceId';

const ST_BASE = `${API_BASE}/api/support-tickets`;

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await auth.getSession();
  if (!session) throw new Error('User not authenticated');
  const deviceId = await getDeviceId();
  return {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
    'X-Device-ID': deviceId,
  };
}

async function apiFetch<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${ST_BASE}${path}`, {
    ...opts,
    headers: { ...headers, ...(opts.headers as Record<string, string> || {}) },
  });
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Unexpected response (${res.status}). Check backend.`);
  }
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || `Request failed: ${res.status}`);
  return json;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type TicketCategory = 'general' | 'billing' | 'technical' | 'account' | 'feature_request' | 'bug_report';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketStatus = 'open' | 'in_progress' | 'waiting_on_user' | 'resolved' | 'closed';

export interface SupportTicket {
  id: string;
  ticket_number: string;
  user_id: string;
  subject: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  assigned_to: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  message_count?: number;
  latest_message_at?: string;
  resolution_hours?: number;
  has_unread?: boolean;
}

export interface TicketMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  is_admin: boolean;
  body: string;
  created_at: string;
  sender_name?: string;
  sender_email?: string;
}

// ─── API Functions ───────────────────────────────────────────────────────────

export async function getMyTickets(status?: TicketStatus): Promise<SupportTicket[]> {
  const qs = status ? `?status=${status}` : '';
  const data = await apiFetch<{ success: boolean; tickets: SupportTicket[] }>(`/${qs}`);
  return data.tickets;
}

export async function createTicket(
  subject: string,
  description: string,
  category?: TicketCategory,
  priority?: TicketPriority
): Promise<SupportTicket> {
  const data = await apiFetch<{ success: boolean; ticket: SupportTicket }>('/', {
    method: 'POST',
    body: JSON.stringify({ subject, description, category, priority }),
  });
  return data.ticket;
}

export async function getTicketDetail(ticketId: string): Promise<SupportTicket> {
  const data = await apiFetch<{ success: boolean; ticket: SupportTicket }>(`/${ticketId}`);
  return data.ticket;
}

export async function getTicketMessages(ticketId: string): Promise<TicketMessage[]> {
  const data = await apiFetch<{ success: boolean; messages: TicketMessage[] }>(`/${ticketId}/messages`);
  return data.messages;
}

export async function replyToTicket(ticketId: string, body: string): Promise<TicketMessage> {
  const data = await apiFetch<{ success: boolean; message: TicketMessage }>(`/${ticketId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
  return data.message;
}

export async function markTicketSeen(ticketId: string): Promise<void> {
  await apiFetch(`/${ticketId}/seen`, { method: 'POST' });
}

export async function getUnreadTicketCount(): Promise<number> {
  const data = await apiFetch<{ success: boolean; count: number }>('/unread-count');
  return data.count;
}
