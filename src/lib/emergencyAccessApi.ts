/**
 * Frontend API helpers for Emergency Access & Trusted Contacts
 */
import { auth } from './auth';
import { getDeviceId } from './deviceId';

const SERVER_BASE = import.meta.env.VITE_API_BASE_URL || '';
const API_BASE = `${SERVER_BASE}/api/emergency-access`;

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

/** Public fetch (no auth header) for invite validation */
async function publicFetch<T = any>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`);
  } catch {
    throw new Error('Cannot reach the backend server.');
  }
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error || `Request failed: ${res.status}`);
  }
  return json;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface TrustedContact {
  id: string;
  owner_id: string;
  contact_email: string;
  contact_user_id: string | null;
  display_name: string;
  relationship: string | null;
  status: 'pending' | 'accepted' | 'revoked';
  invite_sent_at: string | null;
  accepted_at: string | null;
  created_at: string;
  grant_count?: number;
}

export interface EmergencyAccessGrant {
  id: string;
  life_event_id: string;
  trusted_contact_id: string;
  access_policy: 'immediate' | 'time_delayed' | 'approval';
  delay_hours: number;
  is_active: boolean;
  request_status: 'none' | 'pending' | 'approved' | 'denied' | 'auto_granted' | 'vetoed';
  access_requested_at: string | null;
  access_granted_at: string | null;
  cooldown_ends_at: string | null;
  notes: string | null;
  created_at: string;
  // enriched
  contact_name?: string;
  contact_email?: string;
  contact_status?: string;
  event_title?: string;
  owner_name?: string;
}

export interface SharedEventSummary {
  grant_id: string;
  life_event_id: string;
  event_title: string;
  template_id: string;
  owner_id: string;
  owner_name: string;
  owner_email: string;
  access_policy: string;
  delay_hours: number;
  request_status: string;
  access_granted_at: string | null;
  cooldown_ends_at: string | null;
  document_count: number;
}

export interface AccessibleDocument {
  id: string;
  name: string;
  category: string;
  type: string;
  size: string;
  upload_date: string;
  expiration_date: string | null;
  status: string;
}

export interface AuditEntry {
  id: string;
  grant_id: string;
  action: string;
  actor_name?: string;
  document_name?: string;
  created_at: string;
  metadata: Record<string, unknown>;
}

export interface InviteInfo {
  contactName: string;
  contactEmail: string;
  ownerName: string;
  relationship: string | null;
}

// ── Owner: Trusted Contacts ──────────────────────────────────────────────────

export async function getContacts(): Promise<TrustedContact[]> {
  const data = await apiFetch<{ success: boolean; contacts: TrustedContact[] }>('/contacts');
  return data.contacts;
}

export async function createContact(
  email: string,
  displayName: string,
  relationship?: string
): Promise<TrustedContact> {
  const data = await apiFetch<{ success: boolean; contact: TrustedContact }>('/contacts', {
    method: 'POST',
    body: JSON.stringify({ email, display_name: displayName, relationship }),
  });
  return data.contact;
}

export async function resendInvite(contactId: string): Promise<void> {
  await apiFetch(`/contacts/${contactId}/resend`, { method: 'POST' });
}

export async function revokeContact(contactId: string): Promise<void> {
  await apiFetch(`/contacts/${contactId}`, { method: 'DELETE' });
}

// ── Owner: Grants ────────────────────────────────────────────────────────────

export async function getGrantsForEvent(lifeEventId: string): Promise<EmergencyAccessGrant[]> {
  const data = await apiFetch<{ success: boolean; grants: EmergencyAccessGrant[] }>(
    `/events/${lifeEventId}/grants`
  );
  return data.grants;
}

export async function createGrant(
  lifeEventId: string,
  contactId: string,
  accessPolicy: 'immediate' | 'time_delayed' | 'approval',
  delayHours?: number,
  notes?: string
): Promise<EmergencyAccessGrant> {
  const data = await apiFetch<{ success: boolean; grant: EmergencyAccessGrant }>(
    `/events/${lifeEventId}/grants`,
    {
      method: 'POST',
      body: JSON.stringify({
        contact_id: contactId,
        access_policy: accessPolicy,
        delay_hours: delayHours,
        notes,
      }),
    }
  );
  return data.grant;
}

export async function updateGrant(
  grantId: string,
  updates: { access_policy?: string; delay_hours?: number; notes?: string }
): Promise<EmergencyAccessGrant> {
  const data = await apiFetch<{ success: boolean; grant: EmergencyAccessGrant }>(
    `/grants/${grantId}`,
    { method: 'PATCH', body: JSON.stringify(updates) }
  );
  return data.grant;
}

export async function revokeGrant(grantId: string): Promise<void> {
  await apiFetch(`/grants/${grantId}`, { method: 'DELETE' });
}

// ── Owner: Approvals ─────────────────────────────────────────────────────────

export async function getPendingApprovals(): Promise<EmergencyAccessGrant[]> {
  const data = await apiFetch<{ success: boolean; approvals: EmergencyAccessGrant[] }>(
    '/approvals/pending'
  );
  return data.approvals;
}

export async function approveAccess(grantId: string): Promise<void> {
  await apiFetch(`/approvals/${grantId}/approve`, { method: 'POST' });
}

export async function denyAccess(grantId: string): Promise<void> {
  await apiFetch(`/approvals/${grantId}/deny`, { method: 'POST' });
}

export async function vetoAccess(grantId: string): Promise<void> {
  await apiFetch(`/approvals/${grantId}/veto`, { method: 'POST' });
}

// ── Owner: Audit ─────────────────────────────────────────────────────────────

export async function getAuditLog(grantId?: string): Promise<AuditEntry[]> {
  const path = grantId ? `/audit/${grantId}` : '/audit';
  const data = await apiFetch<{ success: boolean; entries: AuditEntry[] }>(path);
  return data.entries;
}

// ── Contact: Shared With Me ──────────────────────────────────────────────────

export async function getSharedWithMe(): Promise<SharedEventSummary[]> {
  const data = await apiFetch<{ success: boolean; events: SharedEventSummary[] }>('/shared');
  return data.events;
}

export async function getSharedEventDetail(grantId: string): Promise<{
  grant: EmergencyAccessGrant;
  documents: AccessibleDocument[];
}> {
  return apiFetch(`/shared/${grantId}`);
}

export async function requestAccess(grantId: string): Promise<{
  status: string;
  cooldownEndsAt?: string;
}> {
  return apiFetch(`/shared/${grantId}/request`, { method: 'POST' });
}

export async function getDocumentPreviewUrl(grantId: string, docId: string): Promise<string> {
  const data = await apiFetch<{ success: boolean; url: string }>(
    `/shared/${grantId}/docs/${docId}/url`
  );
  return data.url;
}

/** Fetch shared document content as a blob via backend proxy (avoids CORS) */
export async function getDocumentContent(grantId: string, docId: string): Promise<Blob> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/shared/${grantId}/docs/${docId}/content`, { headers });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: 'Failed to fetch document content' }));
    throw new Error(errData.error || 'Failed to fetch document content');
  }
  return res.blob();
}

// ── Public: Invite ───────────────────────────────────────────────────────────

export async function validateInvite(token: string): Promise<InviteInfo> {
  const data = await publicFetch<{ success: boolean; invite: InviteInfo }>(`/invite/${token}`);
  return data.invite;
}

export async function acceptInvite(token: string): Promise<void> {
  await apiFetch(`/invite/${token}/accept`, { method: 'POST' });
}

export async function declineInvite(token: string): Promise<void> {
  await apiFetch(`/invite/${token}/decline`, { method: 'POST' });
}
