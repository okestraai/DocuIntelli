/**
 * Frontend API helpers for Life Events feature
 */
import { supabase } from './supabase';

const SERVER_BASE = import.meta.env.VITE_API_BASE_URL || '';
const API_BASE = `${SERVER_BASE}/api/life-events`;

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('User not authenticated');
  return {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  };
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

// -- Templates ---------------------------------------------------------------

export interface TemplateOverview {
  id: string;
  name: string;
  description: string;
  icon: string;
  requirementCount: number;
  sections: string[];
  intakeQuestions: IntakeQuestion[];
}

export interface IntakeQuestion {
  id: string;
  label: string;
  type: 'select' | 'boolean';
  options?: { value: string; label: string }[];
}

export interface TemplateDetail {
  id: string;
  name: string;
  description: string;
  icon: string;
  intakeQuestions: IntakeQuestion[];
  requirements: TemplateRequirement[];
}

export interface TemplateRequirement {
  id: string;
  title: string;
  description: string;
  section: string;
  suggestedTags: string[];
  weight: number;
  notApplicableWhen?: Record<string, string>;
}

export async function getTemplates(): Promise<TemplateOverview[]> {
  const data = await apiFetch<{ success: boolean; templates: TemplateOverview[] }>('/templates');
  return data.templates;
}

export async function getTemplate(id: string): Promise<TemplateDetail> {
  const data = await apiFetch<{ success: boolean; template: TemplateDetail }>(`/templates/${id}`);
  return data.template;
}

// -- Events ------------------------------------------------------------------

export interface LifeEvent {
  id: string;
  template_id: string;
  title: string;
  status: 'active' | 'archived';
  intake_answers: Record<string, string>;
  readiness_score: number;
  created_at: string;
  updated_at: string;
  templateName: string;
  templateIcon: string;
  requirementCount: number;
}

export interface RequirementStatusItem {
  requirementId: string;
  status: string;
  matchedDocuments: {
    documentId: string;
    documentName: string;
    confidence: number;
    method: string;
    tags: string[];
    expirationDate: string | null;
  }[];
  suggestedAction: string | null;
}

export interface ReadinessData {
  eventId: string;
  templateId: string;
  readinessScore: number;
  totalWeight: number;
  completedWeight: number;
  requirements: RequirementStatusItem[];
  nextBestAction: string | null;
}

export interface EventDetail {
  event: LifeEvent & { templateName: string; templateIcon: string };
  template: TemplateDetail;
  readiness: ReadinessData;
}

export async function getEvents(status = 'active'): Promise<LifeEvent[]> {
  const data = await apiFetch<{ success: boolean; events: LifeEvent[] }>(`/?status=${status}`);
  return data.events;
}

export async function createEvent(
  templateId: string,
  intakeAnswers: Record<string, string>
): Promise<{ event: LifeEvent; readiness: ReadinessData }> {
  return apiFetch('/', {
    method: 'POST',
    body: JSON.stringify({ template_id: templateId, intake_answers: intakeAnswers }),
  });
}

export async function getEventDetail(eventId: string): Promise<EventDetail> {
  return apiFetch(`/${eventId}`);
}

export async function recomputeReadiness(eventId: string): Promise<ReadinessData> {
  const data = await apiFetch<{ success: boolean; readiness: ReadinessData }>(
    `/${eventId}/recompute`,
    { method: 'POST' }
  );
  return data.readiness;
}

export async function markNotApplicable(
  eventId: string,
  requirementId: string,
  reason?: string
): Promise<ReadinessData> {
  const data = await apiFetch<{ success: boolean; readiness: ReadinessData }>(
    `/${eventId}/requirements/${requirementId}/not-applicable`,
    { method: 'POST', body: JSON.stringify({ reason }) }
  );
  return data.readiness;
}

export async function manualMatch(
  eventId: string,
  requirementId: string,
  documentId: string
): Promise<ReadinessData> {
  const data = await apiFetch<{ success: boolean; readiness: ReadinessData }>(
    `/${eventId}/requirements/${requirementId}/match`,
    { method: 'POST', body: JSON.stringify({ document_id: documentId }) }
  );
  return data.readiness;
}

export async function unmatch(
  eventId: string,
  requirementId: string
): Promise<ReadinessData> {
  const data = await apiFetch<{ success: boolean; readiness: ReadinessData }>(
    `/${eventId}/requirements/${requirementId}/unmatch`,
    { method: 'POST' }
  );
  return data.readiness;
}

export async function archiveEvent(eventId: string): Promise<void> {
  await apiFetch(`/${eventId}/archive`, { method: 'POST' });
}

export async function unarchiveEvent(eventId: string): Promise<void> {
  await apiFetch(`/${eventId}/unarchive`, { method: 'POST' });
}

export async function getEventExport(eventId: string): Promise<any> {
  const data = await apiFetch(`/${eventId}/export`);
  return data.export;
}

// -- Custom Requirements -----------------------------------------------------

export async function addCustomRequirement(
  eventId: string,
  title: string,
  section?: string
): Promise<ReadinessData> {
  const data = await apiFetch<{ success: boolean; readiness: ReadinessData }>(
    `/${eventId}/custom-requirements`,
    { method: 'POST', body: JSON.stringify({ title, section }) }
  );
  return data.readiness;
}

export async function updateCustomRequirement(
  eventId: string,
  customReqId: string,
  updates: { title?: string; section?: string }
): Promise<ReadinessData> {
  const data = await apiFetch<{ success: boolean; readiness: ReadinessData }>(
    `/${eventId}/custom-requirements/${customReqId}`,
    { method: 'PUT', body: JSON.stringify(updates) }
  );
  return data.readiness;
}

export async function deleteCustomRequirement(
  eventId: string,
  customReqId: string
): Promise<ReadinessData> {
  const data = await apiFetch<{ success: boolean; readiness: ReadinessData }>(
    `/${eventId}/custom-requirements/${customReqId}`,
    { method: 'DELETE' }
  );
  return data.readiness;
}

export async function matchCustomRequirement(
  eventId: string,
  customReqId: string,
  documentId: string
): Promise<ReadinessData> {
  const data = await apiFetch<{ success: boolean; readiness: ReadinessData }>(
    `/${eventId}/custom-requirements/${customReqId}/match`,
    { method: 'POST', body: JSON.stringify({ document_id: documentId }) }
  );
  return data.readiness;
}

export async function unmatchCustomRequirement(
  eventId: string,
  customReqId: string
): Promise<ReadinessData> {
  const data = await apiFetch<{ success: boolean; readiness: ReadinessData }>(
    `/${eventId}/custom-requirements/${customReqId}/unmatch`,
    { method: 'POST' }
  );
  return data.readiness;
}
