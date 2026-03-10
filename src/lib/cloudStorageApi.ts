/**
 * Frontend API helpers for Cloud Storage integration (Google Drive, etc.)
 */
import { auth } from './auth';
import { getDeviceId } from './deviceId';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const BACKEND_URL = `${API_BASE}/api/cloud-storage`;

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
    'X-Device-ID': getDeviceId(),
  };
  const proof = sessionStorage.getItem('impersonation_proof');
  if (proof) headers['X-Impersonation-Proof'] = proof;
  return headers;
}

async function fetchApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Request failed' }));
    const err: any = new Error(errorData.error || `Request failed with status ${res.status}`);
    err.needsReconnect = errorData.needsReconnect;
    throw err;
  }

  return res.json();
}

// ============================================================================
// Types
// ============================================================================

export interface CloudProvider {
  name: string;
  displayName: string;
  connected: boolean;
  email?: string;
}

export interface CloudFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  modifiedTime: string;
  iconUrl?: string;
  isFolder: boolean;
}

export interface ImportFileRequest {
  fileId: string;
  name: string;
  category: string;
  expirationDate?: string;
}

export interface ImportResult {
  fileId: string;
  documentId?: string;
  status: 'imported' | 'already_imported' | 'skipped' | 'failed';
  error?: string;
}

// ============================================================================
// API Functions
// ============================================================================

/** Get list of supported cloud providers and connection status */
export async function getCloudProviders(): Promise<CloudProvider[]> {
  const data = await fetchApi<{ providers: CloudProvider[] }>('/providers');
  return data.providers;
}

/** Initiate OAuth connection flow — redirects the current window */
export async function connectProvider(provider: string): Promise<void> {
  const { data: { session } } = await auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const token = encodeURIComponent(session.access_token);
  const redirectTo = encodeURIComponent(window.location.href);
  window.location.href = `${BACKEND_URL}/${provider}/connect?token=${token}&redirect_to=${redirectTo}`;
}

/** Disconnect a cloud storage provider */
export async function disconnectProvider(provider: string): Promise<void> {
  await fetchApi(`/${provider}/disconnect`, { method: 'DELETE' });
}

/** Browse files in connected cloud storage */
export async function browseCloudFiles(
  provider: string,
  folderId?: string,
  pageToken?: string
): Promise<{ files: CloudFile[]; nextPageToken?: string }> {
  const params = new URLSearchParams();
  if (folderId) params.set('folderId', folderId);
  if (pageToken) params.set('pageToken', pageToken);
  const qs = params.toString();
  return fetchApi(`/${provider}/files${qs ? `?${qs}` : ''}`);
}

/** Import selected files from cloud storage */
export async function importCloudFiles(
  provider: string,
  files: ImportFileRequest[]
): Promise<ImportResult[]> {
  const data = await fetchApi<{ imported: ImportResult[] }>(`/${provider}/import`, {
    method: 'POST',
    body: JSON.stringify({ files }),
  });
  return data.imported;
}
