// Life events API — ported from web
import { supabase } from './supabase';
import { API_BASE } from './config';
import { getDeviceId } from './deviceId';

const LIFE_EVENTS_BASE = `${API_BASE}/api/life-events`;

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('User not authenticated');
  const deviceId = await getDeviceId();
  return { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json', 'X-Device-ID': deviceId };
}

async function apiFetch<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers = await authHeaders();
  const res = await fetch(`${LIFE_EVENTS_BASE}${path}`, {
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

// Types
export interface TemplateOverview {
  id: string; name: string; description: string; icon: string;
  requirementCount: number; sections: string[];
  intakeQuestions: IntakeQuestion[];
}

export interface IntakeQuestion {
  id: string; label: string; type: 'select' | 'boolean';
  options?: { value: string; label: string }[];
}

export interface TemplateDetail {
  id: string; name: string; description: string; icon: string;
  intakeQuestions: IntakeQuestion[];
  requirements: TemplateRequirement[];
}

export interface TemplateRequirement {
  id: string; title: string; description: string; section: string;
  suggestedTags: string[]; weight: number;
  notApplicableWhen?: Record<string, string>;
}

export interface LifeEvent {
  id: string; template_id: string; title: string;
  status: 'active' | 'archived';
  intake_answers: Record<string, string>;
  readiness_score: number;
  created_at: string; updated_at: string;
  templateName: string; templateIcon: string;
  requirementCount: number;
}

export interface RequirementStatusItem {
  requirementId: string; status: string;
  matchedDocuments: {
    documentId: string; documentName: string; confidence: number;
    method: string; tags: string[]; expirationDate: string | null;
  }[];
  suggestedAction: string | null;
}

export interface ReadinessData {
  eventId: string; templateId: string; readinessScore: number;
  totalWeight: number; completedWeight: number;
  requirements: RequirementStatusItem[];
  nextBestAction: string | null;
}

export interface EventDetail {
  event: LifeEvent & { templateName: string; templateIcon: string };
  template: TemplateDetail;
  readiness: ReadinessData;
}

// API calls
export async function getTemplates(): Promise<TemplateOverview[]> {
  const data = await apiFetch<{ success: boolean; templates: TemplateOverview[] }>('/templates');
  return data.templates;
}

export async function getTemplate(id: string): Promise<TemplateDetail> {
  const data = await apiFetch<{ success: boolean; template: TemplateDetail }>(`/templates/${id}`);
  return data.template;
}

export async function getEvents(status = 'active'): Promise<LifeEvent[]> {
  const data = await apiFetch<{ success: boolean; events: LifeEvent[] }>(`/?status=${status}`);
  return data.events;
}

export async function createEvent(templateId: string, intakeAnswers: Record<string, string>): Promise<{ event: LifeEvent; readiness: ReadinessData }> {
  return apiFetch('/', { method: 'POST', body: JSON.stringify({ template_id: templateId, intake_answers: intakeAnswers }) });
}

export async function getEventDetail(eventId: string): Promise<EventDetail> {
  return apiFetch(`/${eventId}`);
}

export async function recomputeReadiness(eventId: string): Promise<ReadinessData> {
  const data = await apiFetch<{ success: boolean; readiness: ReadinessData }>(`/${eventId}/recompute`, { method: 'POST' });
  return data.readiness;
}

export async function archiveEvent(eventId: string): Promise<void> {
  await apiFetch(`/${eventId}/archive`, { method: 'POST' });
}

export async function unarchiveEvent(eventId: string): Promise<void> {
  await apiFetch(`/${eventId}/unarchive`, { method: 'POST' });
}
