// Engagement API — ported from web
import { supabase } from './supabase';
import { API_BASE } from './config';
import { getDeviceId } from './deviceId';

const ENGAGEMENT_BASE = `${API_BASE}/api/engagement`;

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const deviceId = await getDeviceId();
  return {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
    'X-Device-ID': deviceId,
  };
}

async function fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${ENGAGEMENT_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string> || {}) },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(errorData.error || `Request failed with status ${res.status}`);
  }

  return res.json();
}

// Types

export type HealthState = 'healthy' | 'watch' | 'risk' | 'critical';

export interface HealthResult {
  state: HealthState;
  score: number;
  reasons: string[];
}

export interface PreparednessResult {
  score: number;
  trend: 'up' | 'down' | 'stable';
  previousScore: number | null;
  factors: {
    metadataCompleteness: number;
    expirationCoverage: number;
    reviewFreshness: number;
    healthDistribution: number;
    details: {
      docsWithExpiration: number;
      docsWithTags: number;
      docsWithCategory: number;
      docsReviewedRecently: number;
      docsHealthy: number;
      docsWatch: number;
      docsRisk: number;
      docsCritical: number;
      totalDocs: number;
    };
  };
}

export interface GapSuggestion {
  key: string;
  label: string;
  description: string;
  sourceCategory: string;
  priority: 'high' | 'medium' | 'low';
}

export interface HealthSummary {
  healthy: number;
  watch: number;
  risk: number;
  critical: number;
  total: number;
}

export interface TodayFeedItem {
  type: 'health_change' | 'risk' | 'action' | 'gap';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  documentId?: string;
  documentName?: string;
  actionType?: string;
  gapKey?: string;
}

export interface TodayFeedResponse {
  success: boolean;
  feed: TodayFeedItem[];
  preparedness: PreparednessResult;
  healthSummary: HealthSummary;
}

export interface WeeklyAuditData {
  missingExpirations: any[];
  missingReviewCadence: any[];
  nearingExpiration: any[];
  incompleteMetadata: any[];
  gapSuggestions: GapSuggestion[];
  healthSummary: { healthy: number; watch: number; risk: number; critical: number };
  preparedness: PreparednessResult;
}

export interface DocumentHealthResponse {
  success: boolean;
  health: HealthResult;
  insights: any[];
  nextReviewDate: string | null;
  suggestedCadenceDays: number;
  relationships: any[];
  reverseRelationships: any[];
  metadata?: {
    issuer: string;
    ownerName: string;
    expirationDate: string;
  };
}

// API Functions

export async function fetchTodayFeed(): Promise<TodayFeedResponse> {
  return fetchApi<TodayFeedResponse>('/today-feed');
}

export async function fetchWeeklyAudit(): Promise<{ success: boolean; audit: WeeklyAuditData }> {
  return fetchApi('/weekly-audit');
}

export async function fetchPreparedness(): Promise<{ success: boolean; preparedness: PreparednessResult }> {
  return fetchApi('/preparedness');
}

export async function fetchDocumentHealth(documentId: string): Promise<DocumentHealthResponse> {
  return fetchApi(`/documents/${documentId}/health`);
}

export async function updateDocumentMetadata(
  documentId: string,
  metadata: {
    tags?: string[];
    issuer?: string;
    ownerName?: string;
    effectiveDate?: string;
    expirationDate?: string;
  }
): Promise<{ success: boolean; updatedFields: string[] }> {
  return fetchApi(`/documents/${documentId}/metadata`, {
    method: 'POST',
    body: JSON.stringify(metadata),
  });
}

export async function setReviewCadence(documentId: string, cadenceDays: number): Promise<{ success: boolean }> {
  return fetchApi(`/documents/${documentId}/cadence`, {
    method: 'POST',
    body: JSON.stringify({ cadenceDays }),
  });
}

export async function dismissGapSuggestion(
  key: string,
  sourceCategory: string,
  markedAsUploaded: boolean = false
): Promise<{ success: boolean }> {
  return fetchApi(`/gap-suggestions/${key}/dismiss`, {
    method: 'POST',
    body: JSON.stringify({ sourceCategory, markedAsUploaded }),
  });
}
