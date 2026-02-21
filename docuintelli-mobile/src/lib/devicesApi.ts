/**
 * Device Management API helpers
 * Reuses backend endpoints at /api/devices/*
 */
import { supabase } from './supabase';
import { API_BASE } from './config';
import { getDeviceId } from './deviceId';

// ── Helpers ─────────────────────────────────────────────────────

async function backendHeaders(accessToken: string): Promise<Record<string, string>> {
  const deviceId = await getDeviceId();
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'X-Device-ID': deviceId,
  };
}

async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  return session;
}

// ── Types ───────────────────────────────────────────────────────

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

// ── API Functions ───────────────────────────────────────────────

export async function listDevices(): Promise<DeviceListResponse> {
  const session = await getSession();
  const res = await fetch(`${API_BASE}/api/devices`, {
    headers: await backendHeaders(session.access_token),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Failed to list devices' }));
    throw new Error(data.error || `Failed (${res.status})`);
  }

  return res.json();
}

export async function removeDevice(rowId: string): Promise<{ success: boolean }> {
  const session = await getSession();
  const res = await fetch(`${API_BASE}/api/devices/${rowId}`, {
    method: 'DELETE',
    headers: await backendHeaders(session.access_token),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Failed to remove device' }));
    throw new Error(data.error || `Failed (${res.status})`);
  }

  return res.json();
}

// ── Utility ─────────────────────────────────────────────────────

export function formatRelativeTime(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(dateString).toLocaleDateString();
}
