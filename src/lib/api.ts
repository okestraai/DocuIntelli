// src/lib/api.ts
// Frontend API helpers
import { auth } from './auth';
import { getDeviceId } from './deviceId';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

/** Get the impersonation proof token from sessionStorage (if in impersonation tab) */
function getImpersonationProof(): string | null {
  try {
    return sessionStorage.getItem('docuintelli_impersonation_proof');
  } catch {
    return null;
  }
}

/** Standard headers for API calls (includes device ID for multi-device tracking) */
function backendHeaders(accessToken: string, contentType: string = 'application/json'): Record<string, string> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'X-Device-ID': getDeviceId(),
  };
  if (contentType) headers['Content-Type'] = contentType;
  const proof = getImpersonationProof();
  if (proof) headers['X-Impersonation-Proof'] = proof;
  return headers;
}

/** Helper to get access token from auth */
async function getAccessToken(): Promise<string> {
  const { data: { session } } = await auth.getSession();
  if (!session) throw new Error('User not authenticated');
  return session.access_token;
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
  | {
      type: 'file';
      name: string;
      category: string;
      file: File;
      expirationDate?: string;
    }
  | {
      type: 'url';
      name: string;
      category: string;
      url: string;
      expirationDate?: string;
    }
  | {
      type: 'manual';
      name: string;
      category: string;
      content: string;
      expirationDate?: string;
    };

/**
 * Process a URL and create a document
 */
export async function processURLContent(
  url: string,
  name: string,
  category: string,
  expirationDate?: string
): Promise<UploadResponse> {
  try {
    console.log('🔗 Processing URL:', { url, name, category });

    const token = await getAccessToken().catch(() => null);
    if (!token) {
      return { success: false, error: 'User not authenticated' };
    }

    const apiUrl = `${API_BASE}/api/documents/process-url`;

    console.log('📡 Calling API:', apiUrl);

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: backendHeaders(token),
      body: JSON.stringify({
        url,
        name,
        category,
        expirationDate,
      }),
    });

    console.log('📥 Response status:', res.status, res.statusText);

    if (!res.ok) {
      const errorText = await res.text();
      console.error('❌ Error response:', errorText);

      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText || 'URL processing failed' };
      }

      return {
        success: false,
        error: errorData.error || errorData.message || `URL processing failed with status ${res.status}`,
      };
    }

    const result = await res.json();
    console.log('✅ URL processed successfully:', result);
    return result;
  } catch (error) {
    console.error('❌ URL processing error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'URL processing failed',
    };
  }
}

/**
 * Process manually pasted content and create a document
 */
export async function processManualContent(
  content: string,
  name: string,
  category: string,
  expirationDate?: string
): Promise<UploadResponse> {
  try {
    console.log('📝 Processing manual content:', { name, category, contentLength: content.length });

    const token = await getAccessToken().catch(() => null);
    if (!token) {
      return { success: false, error: 'User not authenticated' };
    }

    const apiUrl = `${API_BASE}/api/documents/process-manual`;

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: backendHeaders(token),
      body: JSON.stringify({
        content,
        name,
        category,
        expirationDate,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'Content processing failed' }));
      return {
        success: false,
        error: errorData.error || `Content processing failed with status ${res.status}`,
      };
    }

    const result = await res.json();
    console.log('✅ Manual content processed successfully:', result);
    return result;
  } catch (error) {
    console.error('❌ Manual content processing error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Content processing failed',
    };
  }
}

/**
 * Upload a document file with metadata via backend API
 */
export async function uploadDocumentWithMetadata(
  file: File,
  name: string,
  category: string,
  expirationDate?: string
): Promise<UploadResponse> {
  try {
    console.log('📤 Starting upload for:', { name, category, fileSize: file.size, fileType: file.type });

    // Get auth token
    const { data: { session } } = await auth.getSession();
    if (!session) {
      console.error('❌ No session found');
      return { success: false, error: 'User not authenticated' };
    }

    console.log('✅ Session valid, preparing FormData');

    // Create FormData for multipart upload
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name);
    formData.append('category', category);
    if (expirationDate) {
      formData.append('expirationDate', expirationDate);
    }

    const uploadUrl = `${API_BASE}/api/upload`;

    console.log('📡 Sending request to backend server');

    // Upload via backend server with proper PDF/DOCX/Image extraction
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: backendHeaders(session.access_token, ''),
      body: formData,
    }).catch((fetchError) => {
      console.error('❌ Network error - backend server not reachable:', fetchError.message);
      throw new Error('Cannot connect to backend server. Make sure it is running on port 5000.');
    });

    console.log('📥 Response received:', res.status, res.statusText);

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'Upload failed' }));
      console.error('❌ Upload failed:', errorData);
      return {
        success: false,
        error: errorData.error || `Upload failed with status ${res.status}`,
      };
    }

    const result = await res.json();
    console.log('✅ Upload successful:', result);
    return result;
  } catch (error) {
    console.error('❌ Upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
}

/**
 * Chat with a document using AI (streaming)
 *
 * When `onChunk` is provided, streams tokens progressively.
 * Returns the final result with full answer + sources.
 */
/**
 * Warm up the chat endpoint to eliminate cold start latency.
 * Fire-and-forget — call when user opens a chat view.
 */
export function warmupChatFunction(): void {
  // No-op: Express routes don't have cold starts like edge functions
}

export async function chatWithDocument(
  documentId: string,
  question: string,
  onChunk?: (content: string) => void
): Promise<{ success: boolean; answer: string; sources: any[] }> {
  const { data: { session } } = await auth.getSession();
  if (!session) {
    throw new Error('User not authenticated');
  }

  const apiUrl = `${API_BASE}/api/chat`;

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: backendHeaders(session.access_token),
    body: JSON.stringify({
      document_id: documentId,
      question,
    }),
  });

  // Handle non-streaming error responses (JSON)
  const contentType = res.headers.get('Content-Type') || '';
  if (contentType.includes('application/json')) {
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'Chat request failed' }));
      throw new Error(errorData.error || `Chat failed with status ${res.status}`);
    }
    const data = await res.json();
    return { success: data.success, answer: data.answer || '', sources: data.sources || [] };
  }

  // Parse SSE streaming response
  if (!res.body) {
    throw new Error('No response body');
  }

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
        if (data.type === 'chunk' && onChunk) {
          onChunk(data.content);
        } else if (data.type === 'done') {
          result = { success: true, answer: data.answer, sources: data.sources || [] };
        } else if (data.type === 'error') {
          throw new Error(data.error);
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }

  return result || { success: true, answer: '', sources: [] };
}

/**
 * Load chat history for a document
 */
export async function loadChatHistory(documentId: string) {
  const { data: { session } } = await auth.getSession();
  if (!session) {
    throw new Error('User not authenticated');
  }

  const res = await fetch(`${API_BASE}/api/chat/document/${documentId}/history`, {
    headers: backendHeaders(session.access_token),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: 'Failed to load chat history' }));
    throw new Error(errData.error || 'Failed to load chat history');
  }

  const data = await res.json();
  return data.messages || [];
}

/**
 * Create a Stripe checkout session for subscription
 */
export async function createCheckoutSession(plan: 'starter' | 'pro'): Promise<{ url: string }> {
  const { data: { session } } = await auth.getSession();
  if (!session) {
    throw new Error('User not authenticated');
  }

  const priceIds = {
    starter: import.meta.env.VITE_STRIPE_STARTER_PRICE_ID,
    pro: import.meta.env.VITE_STRIPE_PRO_PRICE_ID,
  };

  const priceId = priceIds[plan];
  if (!priceId) {
    throw new Error(`Price ID not configured for ${plan} plan. Please add VITE_STRIPE_${plan.toUpperCase()}_PRICE_ID to your environment variables.`);
  }

  const apiUrl = `${API_BASE}/api/stripe/checkout`;

  const successUrl = `${window.location.origin}/dashboard?checkout=success`;
  const cancelUrl = `${window.location.origin}/dashboard?checkout=cancel`;

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: backendHeaders(session.access_token),
    body: JSON.stringify({
      price_id: priceId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      mode: 'subscription',
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Checkout session creation failed' }));
    throw new Error(errorData.error || `Failed to create checkout session: ${res.status}`);
  }

  const result = await res.json();
  return { url: result.url };
}

/**
 * Open Stripe Customer Portal for managing subscriptions
 */
export async function openCustomerPortal(): Promise<{ url: string }> {
  const { data: { session } } = await auth.getSession();
  if (!session) {
    throw new Error('User not authenticated');
  }

  const apiUrl = `${API_BASE}/api/stripe/customer-portal`;

  const returnUrl = `${window.location.origin}/dashboard?portal=return`;

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: backendHeaders(session.access_token),
    body: JSON.stringify({
      return_url: returnUrl,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Failed to create portal session' }));
    throw new Error(errorData.error || `Failed to open customer portal: ${res.status}`);
  }

  const result = await res.json();
  return { url: result.url };
}

/**
 * Manually sync billing data from Stripe to database
 */
export async function syncBillingData(): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const { data: { session } } = await auth.getSession();
    if (!session) {
      throw new Error('User not authenticated');
    }

    const apiUrl = `${API_BASE}/api/stripe/sync-billing`;

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: backendHeaders(session.access_token),
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'Billing sync failed' }));
      throw new Error(errorData.error || `Failed to sync billing data: ${res.status}`);
    }

    const result = await res.json();
    return result;
  } catch (error) {
    console.error('Billing sync error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Billing sync failed',
    };
  }
}

/**
 * Cancel subscription (takes effect at period end)
 */
export async function cancelSubscription(): Promise<{ success: boolean; message?: string; cancel_at?: string; error?: string }> {
  try {
    const { data: { session } } = await auth.getSession();
    if (!session) {
      throw new Error('User not authenticated');
    }

    const apiUrl = `${API_BASE}/api/subscription/cancel`;

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: backendHeaders(session.access_token),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'Failed to cancel subscription' }));
      throw new Error(errorData.error || `Failed to cancel: ${res.status}`);
    }

    return await res.json();
  } catch (error) {
    console.error('Cancel subscription error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel subscription',
    };
  }
}

/**
 * Reactivate a canceling subscription
 */
export async function reactivateSubscription(): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const { data: { session } } = await auth.getSession();
    if (!session) {
      throw new Error('User not authenticated');
    }

    const apiUrl = `${API_BASE}/api/subscription/reactivate`;

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: backendHeaders(session.access_token),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'Failed to reactivate subscription' }));
      throw new Error(errorData.error || `Failed to reactivate: ${res.status}`);
    }

    return await res.json();
  } catch (error) {
    console.error('Reactivate subscription error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to reactivate subscription',
    };
  }
}

/**
 * Preview upgrade cost (prorated amount) without applying
 */
export async function previewUpgrade(newPlan: 'starter' | 'pro'): Promise<{
  success: boolean;
  prorated_amount?: number;
  prorated_amount_display?: string;
  new_plan_price?: number;
  new_plan_price_display?: string;
  currency?: string;
  current_plan?: string;
  new_plan?: string;
  current_period_end?: string;
  error?: string;
}> {
  try {
    const { data: { session } } = await auth.getSession();
    if (!session) {
      throw new Error('User not authenticated');
    }

    const res = await fetch(`${API_BASE}/api/subscription/upgrade-preview`, {
      method: 'POST',
      headers: backendHeaders(session.access_token),
      body: JSON.stringify({ new_plan: newPlan }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'Failed to preview upgrade' }));
      throw new Error(errorData.error || `Failed to preview upgrade: ${res.status}`);
    }

    return await res.json();
  } catch (error) {
    console.error('Preview upgrade error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to preview upgrade',
    };
  }
}

/**
 * Upgrade subscription (immediate with proration)
 */
export async function upgradeSubscription(newPlan: 'starter' | 'pro'): Promise<{
  success: boolean;
  message?: string;
  effective_immediately?: boolean;
  current_period_end?: string;
  new_plan?: string;
  previous_plan?: string;
  requiresCheckout?: boolean;
  payment_failed?: boolean;
  error?: string
}> {
  try {
    const { data: { session } } = await auth.getSession();
    if (!session) {
      throw new Error('User not authenticated');
    }

    const apiUrl = `${API_BASE}/api/subscription/upgrade`;

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: backendHeaders(session.access_token),
      body: JSON.stringify({ new_plan: newPlan }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'Failed to upgrade subscription' }));
      // If it requires checkout, return that info
      if (errorData.requiresCheckout) {
        return errorData;
      }
      throw new Error(errorData.error || `Failed to upgrade: ${res.status}`);
    }

    return await res.json();
  } catch (error) {
    console.error('Upgrade subscription error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upgrade subscription',
    };
  }
}

/**
 * Create an upgrade checkout session via Stripe Billing Portal.
 * Shows the user a Stripe-hosted page with the prorated amount
 * and requires explicit confirmation before any charge is made.
 * Only works for Starter → Pro upgrades.
 */
export async function createUpgradeCheckout(): Promise<{
  url?: string;
  upgraded_directly?: boolean;
  prorated_amount: number;
  currency: string;
  current_plan: string;
  new_plan: string;
}> {
  const { data: { session } } = await auth.getSession();
  if (!session) {
    throw new Error('User not authenticated');
  }

  const apiUrl = `${API_BASE}/api/stripe/create-upgrade`;

  const successUrl = `${window.location.origin}/dashboard?upgrade=success`;
  const cancelUrl = `${window.location.origin}/dashboard?upgrade=cancel`;

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: backendHeaders(session.access_token),
    body: JSON.stringify({
      success_url: successUrl,
      cancel_url: cancelUrl,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Failed to create upgrade session' }));
    throw new Error(errorData.error || `Failed to create upgrade session: ${res.status}`);
  }

  return res.json();
}

/**
 * Downgrade subscription (takes effect at period end)
 */
export async function downgradeSubscription(
  newPlan: 'free' | 'starter' | 'pro',
  documentsToKeep?: string[]
): Promise<{
  success: boolean;
  message?: string;
  effective_date?: string;
  error?: string
}> {
  try {
    const { data: { session } } = await auth.getSession();
    if (!session) {
      throw new Error('User not authenticated');
    }

    const apiUrl = `${API_BASE}/api/subscription/downgrade`;

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: backendHeaders(session.access_token),
      body: JSON.stringify({
        new_plan: newPlan,
        ...(documentsToKeep && { documents_to_keep: documentsToKeep }),
      }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'Failed to downgrade subscription' }));
      throw new Error(errorData.error || `Failed to downgrade: ${res.status}`);
    }

    return await res.json();
  } catch (error) {
    console.error('Downgrade subscription error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to downgrade subscription',
    };
  }
}

// ─── Email Notification API Helpers ────────────────────────────────────────────

async function callEmailApi(endpoint: string, body?: Record<string, any>): Promise<{ success: boolean; sent?: boolean; error?: string }> {
  try {
    const { data: { session } } = await auth.getSession();
    if (!session) return { success: false, error: 'Not authenticated' };

    const res = await fetch(`${API_BASE}/api/email/${endpoint}`, {
      method: 'POST',
      headers: backendHeaders(session.access_token),
      body: body ? JSON.stringify(body) : undefined,
    });

    return await res.json();
  } catch (error) {
    console.error(`Email API (${endpoint}) error:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Email request failed' };
  }
}

/** Send welcome email after signup */
export function sendWelcomeEmail() {
  return callEmailApi('welcome');
}

/** Send password changed notification */
export function sendPasswordChangedEmail() {
  return callEmailApi('password-changed');
}

/** Send account deletion confirmation */
export function sendAccountDeletedEmail(email: string, userName: string, documentCount: number) {
  return callEmailApi('account-deleted', { email, userName, documentCount });
}

/** Send document expiration reminders */
export function sendDocumentExpiringEmail(documents: { name: string; category: string; expirationDate: string; daysUntil: number }[]) {
  return callEmailApi('document-expiring', { documents });
}

/** Send weekly audit digest email */
export function sendWeeklyAuditEmail(auditData: Record<string, any>) {
  return callEmailApi('weekly-audit', { auditData });
}

/** Send profile updated notification */
export function sendProfileUpdatedEmail(changes: { field: string; newValue: string }[]) {
  return callEmailApi('profile-updated', { changes });
}

/** Send preferences updated notification */
export function sendPreferencesUpdatedEmail(changes: { setting: string; oldValue: string; newValue: string }[]) {
  return callEmailApi('preferences-updated', { changes });
}

/** Send a test email */
export function sendTestEmail() {
  return callEmailApi('test');
}

// ── Plan Pricing (from Stripe) ─────────────────────────────────────

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
  } catch (error) {
    console.warn('Price fetch failed, using defaults:', error);
    return DEFAULT_PRICES;
  }
}

// ─── Global Search ──────────────────────────────────────────────────

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

/**
 * Search across all user documents (Pro feature)
 */
export async function globalSearch(
  query: string,
  options?: { category?: string; tags?: string[]; limit?: number }
): Promise<GlobalSearchResponse> {
  const { data: { session } } = await auth.getSession();
  if (!session) {
    throw new Error('User not authenticated');
  }

  const res = await fetch(`${API_BASE}/api/search`, {
    method: 'POST',
    headers: backendHeaders(session.access_token),
    body: JSON.stringify({
      query,
      ...options,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Search failed' }));

    if (res.status === 403 && errorData.code === 'FEATURE_NOT_AVAILABLE') {
      throw Object.assign(new Error(errorData.message || 'Global Search is a Pro feature'), {
        code: 'FEATURE_NOT_AVAILABLE',
      });
    }

    throw new Error(errorData.error || `Search failed with status ${res.status}`);
  }

  return res.json();
}

// ─── Global Chat (Cross-Document) ───────────────────────────────────

export interface GlobalChatSource {
  document_id: string;
  document_name: string;
  chunk_index: number;
  similarity: number;
}

/**
 * Stream a cross-document AI chat response (Pro feature).
 * Supports @DocumentName to scope to a single document.
 */
export async function globalChatStream(
  question: string,
  onChunk?: (content: string) => void
): Promise<{ success: boolean; answer: string; sources: GlobalChatSource[] }> {
  const { data: { session } } = await auth.getSession();
  if (!session) {
    throw new Error('User not authenticated');
  }

  const res = await fetch(`${API_BASE}/api/global-chat`, {
    method: 'POST',
    headers: backendHeaders(session.access_token),
    body: JSON.stringify({ question }),
  });

  // Handle non-streaming error responses
  const contentType = res.headers.get('Content-Type') || '';
  if (contentType.includes('application/json')) {
    const errorData = await res.json().catch(() => ({ error: 'Chat failed' }));
    if (res.status === 403 && errorData.code === 'FEATURE_NOT_AVAILABLE') {
      throw Object.assign(new Error(errorData.message || 'Global Chat is a Pro feature'), {
        code: 'FEATURE_NOT_AVAILABLE',
      });
    }
    throw new Error(errorData.error || `Chat failed with status ${res.status}`);
  }

  if (!res.body) {
    throw new Error('No response body');
  }

  // Parse SSE stream (same format as chatWithDocument)
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
        if (data.type === 'chunk' && onChunk) {
          onChunk(data.content);
        } else if (data.type === 'done') {
          result = { success: true, answer: data.answer, sources: data.sources || [] };
        } else if (data.type === 'error') {
          throw new Error(data.error);
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }

  return result || { success: true, answer: '', sources: [] };
}

/**
 * Load global chat conversation history.
 */
export async function loadGlobalChatHistory(): Promise<Array<{
  id: string;
  role: string;
  content: string;
  sources?: GlobalChatSource[];
  created_at: string;
}>> {
  const { data: { session } } = await auth.getSession();
  if (!session) return [];

  try {
    const res = await fetch(`${API_BASE}/api/chat/global/history`, {
      headers: backendHeaders(session.access_token),
    });

    if (!res.ok) {
      console.error('Error loading global chat history:', res.status);
      return [];
    }

    const data = await res.json();
    return data.messages || [];
  } catch (error) {
    console.error('Error loading global chat history:', error);
    return [];
  }
}

// ─── Device Management ──────────────────────────────────────────────

export interface UserDevice {
  id: string;
  device_id: string;
  device_name: string;
  platform: string;
  last_active_at: string;
  created_at: string;
  is_blocked: boolean;
}

export interface DeviceListResponse {
  success: boolean;
  devices: UserDevice[];
  limit: number;
  plan: string;
  current_device_id: string | null;
}

export async function listDevices(): Promise<DeviceListResponse> {
  const { data: { session } } = await auth.getSession();
  if (!session) throw new Error('User not authenticated');

  const res = await fetch(`${API_BASE}/api/devices`, {
    headers: backendHeaders(session.access_token),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Failed to list devices' }));
    throw new Error(errorData.error || `Failed (${res.status})`);
  }

  return res.json();
}

export async function removeDevice(rowId: string): Promise<{ success: boolean }> {
  const { data: { session } } = await auth.getSession();
  if (!session) throw new Error('User not authenticated');

  const res = await fetch(`${API_BASE}/api/devices/${rowId}`, {
    method: 'DELETE',
    headers: backendHeaders(session.access_token),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Failed to remove device' }));
    throw new Error(errorData.error || `Failed (${res.status})`);
  }

  return res.json();
}

// ─── Client Error Logging ────────────────────────────────────────────

/**
 * Log a client-side error to the backend for admin troubleshooting.
 * Fire-and-forget — never throws.
 */
export function logClientError(
  feature: string,
  error: string,
  context?: Record<string, unknown>
): void {
  auth.getSession().then(({ data: { session } }) => {
    if (!session) return;
    fetch(`${API_BASE}/api/errors/log`, {
      method: 'POST',
      headers: backendHeaders(session.access_token),
      body: JSON.stringify({ feature, error, context }),
    }).catch(() => { /* swallow — best-effort logging */ });
  }).catch(() => {});
}
