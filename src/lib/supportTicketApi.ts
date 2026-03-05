/**
 * Frontend API helpers for Support Tickets
 */
import { auth } from './auth';
import { getDeviceId } from './deviceId';

const SERVER_BASE = import.meta.env.VITE_API_BASE_URL || '';
const API_BASE = `${SERVER_BASE}/api/support-tickets`;

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await auth.getSession();
  if (!session) throw new Error('User not authenticated');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
    'X-Device-ID': getDeviceId(),
  };
  const proof = sessionStorage.getItem('impersonation_proof');
  if (proof) headers['X-Impersonation-Proof'] = proof;
  return headers;
}

async function apiFetch<T = any>(
  path: string,
  opts: RequestInit = {}
): Promise<T> {
  const headers = await authHeaders();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...opts,
      headers: { ...headers, ...(opts.headers as Record<string, string> || {}) },
    });
  } catch {
    throw new Error('Cannot reach the backend server. Please ensure it is running on port 5000.');
  }
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Backend returned unexpected response (${res.status}). Please restart the backend server.`);
  }
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Request failed: ${res.status}`);
  }
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
  user_email?: string;
  user_name?: string;
  assigned_name?: string;
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

// ─── User API ────────────────────────────────────────────────────────────────

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

// ─── Admin API ───────────────────────────────────────────────────────────────

export async function adminGetAllTickets(params: {
  status?: TicketStatus;
  category?: TicketCategory;
  priority?: TicketPriority;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{ tickets: SupportTicket[]; total: number }> {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.category) qs.set('category', params.category);
  if (params.priority) qs.set('priority', params.priority);
  if (params.search) qs.set('search', params.search);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  const data = await apiFetch<{ success: boolean; tickets: SupportTicket[]; total: number }>(`/admin/all?${qs}`);
  return { tickets: data.tickets, total: data.total };
}

export async function adminGetTicketDetail(ticketId: string): Promise<{
  ticket: SupportTicket;
  messages: TicketMessage[];
}> {
  const data = await apiFetch<{ success: boolean; ticket: SupportTicket; messages: TicketMessage[] }>(`/admin/${ticketId}`);
  return { ticket: data.ticket, messages: data.messages };
}

export async function adminUpdateStatus(ticketId: string, status: TicketStatus): Promise<SupportTicket> {
  const data = await apiFetch<{ success: boolean; ticket: SupportTicket }>(`/admin/${ticketId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  return data.ticket;
}

export async function adminAssignTicket(ticketId: string, assignedTo: string | null): Promise<SupportTicket> {
  const data = await apiFetch<{ success: boolean; ticket: SupportTicket }>(`/admin/${ticketId}/assign`, {
    method: 'PATCH',
    body: JSON.stringify({ assigned_to: assignedTo }),
  });
  return data.ticket;
}

export async function adminReply(ticketId: string, body: string): Promise<TicketMessage> {
  const data = await apiFetch<{ success: boolean; message: TicketMessage }>(`/admin/${ticketId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
  return data.message;
}
