// Backend API helpers — ported from web
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { API_BASE, SUPABASE_URL, SUPABASE_ANON_KEY } from './config';
import { getDeviceId } from './deviceId';

/** Standard headers for Supabase Edge Function calls */
function edgeFunctionHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
  };
}

export interface UploadResponse {
  success: boolean;
  data?: {
    document_id: string;
    file_key?: string;
    public_url?: string;
    file_type?: string;
    chunks_created?: number;
    content_length?: number;
  };
  error?: string;
}

export type DocumentUploadRequest =
  | { type: 'file'; name: string; category: string; fileUri: string; fileName: string; mimeType: string; expirationDate?: string }
  | { type: 'url'; name: string; category: string; url: string; expirationDate?: string }
  | { type: 'manual'; name: string; category: string; content: string; expirationDate?: string };

// ── Upload (file via multipart) ─────────────────────────────────────

export async function uploadDocumentFile(
  fileUri: string,
  fileName: string,
  mimeType: string,
  name: string,
  category: string,
  expirationDate?: string
): Promise<UploadResponse> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { success: false, error: 'User not authenticated' };

    const formData = new FormData();

    if (Platform.OS === 'web') {
      // On web, FormData needs an actual Blob/File object.
      // DocumentPicker returns a blob: URI — fetch it to get the Blob.
      const blob = await fetch(fileUri).then((r) => r.blob());
      const file = new File([blob], fileName, { type: mimeType });
      formData.append('file', file);
    } else {
      // On native (iOS/Android), RN's FormData handles { uri, name, type }
      formData.append('file', { uri: fileUri, name: fileName, type: mimeType } as any);
    }

    formData.append('name', name);
    formData.append('category', category);
    if (expirationDate) formData.append('expirationDate', expirationDate);

    const deviceId = await getDeviceId();
    const res = await fetch(`${API_BASE}/api/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, 'X-Device-ID': deviceId },
      body: formData,
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'Upload failed' }));
      return { success: false, error: errorData.error || `Upload failed (${res.status})` };
    }

    return await res.json();
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Upload failed' };
  }
}

// ── Process URL content ─────────────────────────────────────────────

export async function processURLContent(
  url: string,
  name: string,
  category: string,
  expirationDate?: string
): Promise<UploadResponse> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { success: false, error: 'User not authenticated' };

    const res = await fetch(`${SUPABASE_URL}/functions/v1/process-url-content`, {
      method: 'POST',
      headers: edgeFunctionHeaders(session.access_token),
      body: JSON.stringify({ url, name, category, expirationDate }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'URL processing failed' }));
      return { success: false, error: errorData.error || `URL processing failed (${res.status})` };
    }

    return await res.json();
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'URL processing failed' };
  }
}

// ── Process manual content ──────────────────────────────────────────

export async function processManualContent(
  content: string,
  name: string,
  category: string,
  expirationDate?: string
): Promise<UploadResponse> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { success: false, error: 'User not authenticated' };

    const res = await fetch(`${SUPABASE_URL}/functions/v1/process-manual-content`, {
      method: 'POST',
      headers: edgeFunctionHeaders(session.access_token),
      body: JSON.stringify({ content, name, category, expirationDate }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'Content processing failed' }));
      return { success: false, error: errorData.error || `Content processing failed (${res.status})` };
    }

    return await res.json();
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Content processing failed' };
  }
}

// ── Chat with document (SSE streaming) ──────────────────────────────

export async function chatWithDocument(
  documentId: string,
  question: string,
  onChunk?: (content: string) => void
): Promise<{ success: boolean; answer: string; sources: any[] }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('User not authenticated');

  const res = await fetch(`${SUPABASE_URL}/functions/v1/chat-document`, {
    method: 'POST',
    headers: edgeFunctionHeaders(session.access_token),
    body: JSON.stringify({ document_id: documentId, question, user_id: session.user.id }),
  });

  const contentType = res.headers.get('Content-Type') || '';
  if (contentType.includes('application/json')) {
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'Chat request failed' }));
      throw new Error(errorData.error || `Chat failed (${res.status})`);
    }
    const data = await res.json();
    return { success: data.success, answer: data.answer || '', sources: data.sources || [] };
  }

  // Parse SSE streaming response.
  // React Native's fetch does not support ReadableStream (res.body is null),
  // so fall back to reading the full response text and parsing SSE events from it.
  const parseSSELines = (text: string): { success: boolean; answer: string; sources: any[] } => {
    let result: { success: boolean; answer: string; sources: any[] } | null = null;
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      try {
        const data = JSON.parse(trimmed.slice(6));
        if (data.type === 'chunk' && onChunk) onChunk(data.content);
        else if (data.type === 'done') result = { success: true, answer: data.answer, sources: data.sources || [] };
        else if (data.type === 'error') throw new Error(data.error);
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
    return result || { success: true, answer: '', sources: [] };
  };

  if (!res.body) {
    // Native: no streaming support — read full response then parse
    const text = await res.text();
    return parseSSELines(text);
  }

  // Web: stream via ReadableStream for real-time chunks
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let result: { success: boolean; answer: string; sources: any[] } | null = null;
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;

      try {
        const data = JSON.parse(trimmed.slice(6));
        if (data.type === 'chunk' && onChunk) onChunk(data.content);
        else if (data.type === 'done') result = { success: true, answer: data.answer, sources: data.sources || [] };
        else if (data.type === 'error') throw new Error(data.error);
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }

  return result || { success: true, answer: '', sources: [] };
}

// ── Load chat history ───────────────────────────────────────────────

export async function loadChatHistory(documentId: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('User not authenticated');

  const { data, error } = await supabase
    .from('document_chats')
    .select('id, role, content, created_at')
    .eq('user_id', session.user.id)
    .eq('document_id', documentId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

// ── Global Search (Pro) ─────────────────────────────────────────────

export interface GlobalSearchMatch {
  chunk_id: string;
  chunk_index: number;
  chunk_text: string;
  highlight: string;
  combined_score: number;
}

export interface GlobalSearchResultGroup {
  document_id: string;
  document_name: string;
  document_category: string;
  document_tags: string[];
  total_matches: number;
  matches: GlobalSearchMatch[];
}

export interface GlobalSearchResponse {
  results: GlobalSearchResultGroup[];
  total_documents: number;
  total_chunks: number;
  query_time_ms: number;
}

export async function globalSearch(
  query: string,
  options?: { category?: string; tags?: string[]; limit?: number }
): Promise<GlobalSearchResponse> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('User not authenticated');

  const deviceId = await getDeviceId();
  const res = await fetch(`${API_BASE}/api/search`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      'X-Device-ID': deviceId,
    },
    body: JSON.stringify({ query, ...options }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Search failed' }));
    if (res.status === 403 && errorData.code === 'FEATURE_NOT_AVAILABLE') {
      throw Object.assign(new Error(errorData.message || 'Global Search is a Pro feature'), { code: 'FEATURE_NOT_AVAILABLE' });
    }
    throw new Error(errorData.error || `Search failed (${res.status})`);
  }

  return res.json();
}

// ── Global Chat (Pro, SSE streaming) ────────────────────────────────

export interface GlobalChatSource {
  document_id: string;
  document_name: string;
  chunk_index: number;
  similarity: number;
}

export async function globalChatStream(
  question: string,
  onChunk?: (content: string) => void
): Promise<{ success: boolean; answer: string; sources: GlobalChatSource[] }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('User not authenticated');

  const deviceId2 = await getDeviceId();
  const res = await fetch(`${API_BASE}/api/global-chat`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      'X-Device-ID': deviceId2,
    },
    body: JSON.stringify({ question }),
  });

  const contentType = res.headers.get('Content-Type') || '';
  if (contentType.includes('application/json')) {
    const errorData = await res.json().catch(() => ({ error: 'Chat failed' }));
    if (res.status === 403 && errorData.code === 'FEATURE_NOT_AVAILABLE') {
      throw Object.assign(new Error(errorData.message || 'Global Chat is a Pro feature'), { code: 'FEATURE_NOT_AVAILABLE' });
    }
    throw new Error(errorData.error || `Chat failed (${res.status})`);
  }

  if (!res.body) throw new Error('No response body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let result: { success: boolean; answer: string; sources: GlobalChatSource[] } | null = null;
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      try {
        const data = JSON.parse(trimmed.slice(6));
        if (data.type === 'chunk' && onChunk) onChunk(data.content);
        else if (data.type === 'done') result = { success: true, answer: data.answer, sources: data.sources || [] };
        else if (data.type === 'error') throw new Error(data.error);
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }

  return result || { success: true, answer: '', sources: [] };
}

export async function loadGlobalChatHistory(): Promise<Array<{
  id: string; role: string; content: string; sources?: GlobalChatSource[]; created_at: string;
}>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];

  const { data, error } = await supabase
    .from('global_chats')
    .select('id, role, content, sources, created_at')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) return [];
  return data || [];
}

// ── Pricing ─────────────────────────────────────────────────────────

export interface StripePrices {
  free: { monthly: number; yearly: number };
  starter: { monthly: number; yearly: number };
  pro: { monthly: number; yearly: number };
}

const DEFAULT_PRICES: StripePrices = {
  free: { monthly: 0, yearly: 0 },
  starter: { monthly: 7, yearly: 70 },
  pro: { monthly: 19, yearly: 190 },
};

export async function fetchPlanPrices(): Promise<StripePrices> {
  try {
    const res = await fetch(`${API_BASE}/api/pricing`);
    if (!res.ok) throw new Error(`Failed to fetch prices: ${res.status}`);
    const data = await res.json();
    if (data.success && data.prices) return data.prices;
    throw new Error('Invalid pricing response');
  } catch {
    return DEFAULT_PRICES;
  }
}
