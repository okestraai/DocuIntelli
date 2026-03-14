// ── E-Signature API client ───────────────────────────────────────────
// Consumes the same backend endpoints as the web app.
// Follows the pattern established in src/lib/api.ts.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from './auth';
import { API_BASE } from './config';
import { getDeviceId } from './deviceId';
import type {
  ValidateTokenResponse,
  FieldsResponse,
  CompleteResponse,
  MySignaturesResponse,
  CreateRequestPayload,
  CreateRequestResponse,
  RequestDetail,
  SelfSignFieldValue,
  SignedPdfResponse,
} from '../types/esignature';

// ── Helpers ─────────────────────────────────────────────────────────

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

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
    const err = new Error(errData.error || errData.message || `Request failed (${res.status})`);
    if (errData.code) (err as any).code = errData.code;
    throw err;
  }
  return res.json();
}

// ── Token-based signing (public, no auth required) ──────────────────

export async function validateSigningToken(token: string): Promise<ValidateTokenResponse> {
  const res = await fetch(`${API_BASE}/api/esignature/sign/${token}`);
  return handleResponse(res);
}

export async function getTokenFields(token: string): Promise<FieldsResponse> {
  const res = await fetch(`${API_BASE}/api/esignature/sign/${token}/fields`, { method: 'POST' });
  return handleResponse(res);
}

export async function fillTokenField(token: string, fieldId: string, value: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/esignature/sign/${token}/fill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fieldId, value }),
  });
  return handleResponse(res);
}

export async function completeTokenSigning(token: string): Promise<CompleteResponse> {
  const res = await fetch(`${API_BASE}/api/esignature/sign/${token}/complete`, { method: 'POST' });
  return handleResponse(res);
}

export async function linkTokenAccount(token: string, userId: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/esignature/sign/${token}/link-account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  return handleResponse(res);
}

export async function captureTokenVault(token: string, userId: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/esignature/sign/${token}/vault-capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  return handleResponse(res);
}

/** Returns the URL for streaming the PDF document (token-based) */
export function getTokenDocumentUrl(token: string): string {
  return `${API_BASE}/api/esignature/sign/${token}/document`;
}

// ── Authenticated signer endpoints ──────────────────────────────────

export async function validateSigner(signerId: string): Promise<ValidateTokenResponse> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/esignature/signer/${signerId}/validate`, { headers });
  return handleResponse(res);
}

export async function getSignerFields(signerId: string): Promise<FieldsResponse> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/esignature/signer/${signerId}/fields`, { headers });
  return handleResponse(res);
}

export async function fillSignerField(signerId: string, fieldId: string, value: string): Promise<{ success: boolean }> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/esignature/signer/${signerId}/fill`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ fieldId, value }),
  });
  return handleResponse(res);
}

export async function completeSignerSigning(signerId: string): Promise<CompleteResponse> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/esignature/signer/${signerId}/complete`, {
    method: 'POST',
    headers,
  });
  return handleResponse(res);
}

/** Returns the URL + auth header for streaming the PDF document (authenticated) */
export async function getSignerDocumentUrl(signerId: string): Promise<{ url: string; headers: Record<string, string> }> {
  const headers = await authHeaders();
  return { url: `${API_BASE}/api/esignature/signer/${signerId}/document`, headers };
}

export async function captureSignerVault(signerId: string): Promise<{ success: boolean }> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/esignature/signer/${signerId}/vault-capture`, {
    method: 'POST',
    headers,
  });
  return handleResponse(res);
}

// ── Request management (initiator, authenticated + email gate) ──────

export async function getMySignatures(): Promise<MySignaturesResponse> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/esignature/my-signatures`, { headers });
  return handleResponse(res);
}

export async function createRequest(data: CreateRequestPayload): Promise<CreateRequestResponse> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/esignature/requests`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function sendRequest(requestId: string, documentName: string): Promise<{ success: boolean; message: string }> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/esignature/requests/${requestId}/send`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ documentName }),
  });
  return handleResponse(res);
}

export async function selfSign(requestId: string, fieldValues: SelfSignFieldValue[]): Promise<{ success: boolean; allComplete?: boolean }> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/esignature/requests/${requestId}/self-sign`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ fieldValues }),
  });
  return handleResponse(res);
}

export async function voidRequest(requestId: string): Promise<{ success: boolean }> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/esignature/requests/${requestId}/void`, {
    method: 'POST',
    headers,
  });
  return handleResponse(res);
}

export async function deleteRequest(requestId: string): Promise<{ success: boolean }> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/esignature/requests/${requestId}`, {
    method: 'DELETE',
    headers,
  });
  return handleResponse(res);
}

export async function getSignedPdf(requestId: string): Promise<SignedPdfResponse> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/esignature/requests/${requestId}/signed-pdf`, { headers });
  return handleResponse(res);
}

export async function remindSigners(requestId: string): Promise<{ success: boolean; message: string }> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/esignature/requests/${requestId}/remind`, {
    method: 'POST',
    headers,
  });
  return handleResponse(res);
}

export async function getRequestDetail(requestId: string): Promise<{ success: boolean; data: RequestDetail }> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/esignature/requests/${requestId}`, { headers });
  return handleResponse(res);
}

// ── Signature image persistence (server-side) ───────────────────────

export async function saveSignatureImage(imageType: 'signature' | 'initials', imageData: string): Promise<{ success: boolean }> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/esignature/signature-image`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ imageType, imageData }),
  });
  return handleResponse(res);
}

export async function getSignatureImage(imageType: 'signature' | 'initials'): Promise<{ success: boolean; data: { imageData: string | null } }> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/api/esignature/signature-image/${imageType}`, { headers });
  return handleResponse(res);
}

// ── Field memory (AsyncStorage, equivalent to web's localStorage) ───

const FIELD_MEMORY_PREFIX = 'esign_memory_';

export async function getFieldMemory(fieldType: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(`${FIELD_MEMORY_PREFIX}${fieldType}`);
  } catch {
    return null;
  }
}

export async function setFieldMemory(fieldType: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(`${FIELD_MEMORY_PREFIX}${fieldType}`, value);
  } catch {
    // Best-effort — don't block signing flow
  }
}
