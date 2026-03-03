/**
 * docuintelli-mobile/src/lib/auth.ts
 *
 * Mobile-specific authentication client that replaces Supabase Auth.
 * Stores JWT tokens in AsyncStorage (React Native) instead of localStorage.
 * Uses expo-web-browser for native Google OAuth and standard redirects for web.
 *
 * Provides the same API shape as the web src/lib/auth.ts so that existing
 * consumers can migrate with minimal code changes.
 *
 * Key design decisions:
 * - Token storage: AsyncStorage for cross-platform persistence
 * - Auto-refresh: checks token expiry every 30 seconds, refreshes with 2-min buffer
 * - Event system: mirrors Supabase onAuthStateChange with SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED / INITIAL_SESSION
 * - Google OAuth: native uses expo-web-browser in-app browser; web uses full redirect
 * - NO imports from @supabase/supabase-js
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { API_BASE } from './config';

// ─── Storage Keys ─────────────────────────────────────────────────────────────

const TOKEN_KEY = 'docuintelli_access_token';
const REFRESH_TOKEN_KEY = 'docuintelli_refresh_token';
const USER_KEY = 'docuintelli_auth_user';

// ─── Auto-refresh Settings ────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 30_000; // Check every 30 seconds
const REFRESH_BUFFER_SECONDS = 120; // Refresh when <2 minutes until expiry

// ─── Types ────────────────────────────────────────────────────────────────────

/** Mirrors the document shape from the old supabase.ts for backwards compatibility */
export interface SupabaseDocument {
  id: string;
  user_id: string;
  name: string;
  category: string;
  type: string;
  size: string;
  file_path: string;
  original_name: string;
  upload_date: string;
  expiration_date?: string;
  status: 'active' | 'expiring' | 'expired';
  processed: boolean;
  created_at: string;
  updated_at: string;
  tags?: string[];
}

export interface UserProfile {
  id: string;
  display_name?: string;
  bio?: string;
  full_name?: string;
  date_of_birth?: string;
  phone?: string;
  email_notifications: boolean;
  document_reminders: boolean;
  security_alerts: boolean;
  billing_alerts: boolean;
  document_alerts: boolean;
  engagement_digests: boolean;
  life_event_alerts: boolean;
  activity_alerts: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthUser {
  id: string;
  email: string;
  user_metadata?: Record<string, any>;
  created_at?: string;
  email_confirmed?: boolean;
  email_confirmed_at?: string;
  display_name?: string;
  full_name?: string;
  last_sign_in_at?: string;
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  user: AuthUser;
}

export type AuthEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'INITIAL_SESSION';
export type AuthChangeCallback = (event: AuthEvent, session: AuthSession | null) => void;

// ─── Async Storage Abstraction ────────────────────────────────────────────────

async function storeTokens(accessToken: string, refreshToken: string, user: AuthUser): Promise<void> {
  await AsyncStorage.multiSet([
    [TOKEN_KEY, accessToken],
    [REFRESH_TOKEN_KEY, refreshToken],
    [USER_KEY, JSON.stringify(user)],
  ]);
}

async function readTokens(): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
}> {
  const pairs = await AsyncStorage.multiGet([TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY]);
  const accessToken = pairs[0][1];
  const refreshToken = pairs[1][1];
  let user: AuthUser | null = null;
  try {
    const raw = pairs[2][1];
    if (raw) user = JSON.parse(raw);
  } catch {
    // Corrupted user data — treat as not authenticated
  }
  return { accessToken, refreshToken, user };
}

async function clearTokens(): Promise<void> {
  await AsyncStorage.multiRemove([TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY]);
}

// Synchronous in-memory cache for fast session access.
// Updated on every store/clear and populated on module init.
let cachedAccessToken: string | null = null;
let cachedRefreshToken: string | null = null;
let cachedUser: AuthUser | null = null;

function cacheTokens(accessToken: string, refreshToken: string, user: AuthUser): void {
  cachedAccessToken = accessToken;
  cachedRefreshToken = refreshToken;
  cachedUser = user;
}

function clearCache(): void {
  cachedAccessToken = null;
  cachedRefreshToken = null;
  cachedUser = null;
}

/**
 * Read tokens with a fast path: return the in-memory cache if available,
 * otherwise fall through to AsyncStorage.
 */
async function readTokensCached(): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
}> {
  if (cachedAccessToken && cachedRefreshToken && cachedUser) {
    return {
      accessToken: cachedAccessToken,
      refreshToken: cachedRefreshToken,
      user: cachedUser,
    };
  }
  const tokens = await readTokens();
  if (tokens.accessToken && tokens.refreshToken && tokens.user) {
    cacheTokens(tokens.accessToken, tokens.refreshToken, tokens.user);
  }
  return tokens;
}

// ─── JWT Utilities ────────────────────────────────────────────────────────────

/**
 * Decode a JWT payload without any library.
 * JWTs are three base64url-encoded segments separated by dots.
 * We only need the middle segment (payload).
 *
 * Uses atob which is available in React Native (Hermes) and web environments.
 */
function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    // base64url -> base64
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    // Pad to multiple of 4
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }

    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );

    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

/**
 * Extract the user object from a JWT access token.
 * Our backend JWTs should carry `sub` (user id) and `email`.
 */
function userFromToken(token: string): AuthUser | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;

  return {
    id: payload.sub || payload.user_id || '',
    email: payload.email || '',
    user_metadata: payload.user_metadata || {},
  };
}

/**
 * Returns the number of seconds until the token expires.
 * Returns -1 if the token is invalid or already expired.
 */
function secondsUntilExpiry(token: string): number {
  const payload = decodeJwtPayload(token);
  if (!payload || !payload.exp) return -1;
  return payload.exp - Math.floor(Date.now() / 1000);
}

/**
 * Returns true if the token is expired or will expire within the buffer window.
 */
function isTokenExpiredOrExpiring(token: string): boolean {
  const remaining = secondsUntilExpiry(token);
  return remaining < REFRESH_BUFFER_SECONDS;
}

// ─── Event System ─────────────────────────────────────────────────────────────

type ListenerId = number;
let nextListenerId = 0;
const listeners = new Map<ListenerId, AuthChangeCallback>();

function fireEvent(event: AuthEvent, session: AuthSession | null): void {
  // Use setTimeout(0) so event handlers run outside the current call stack,
  // preventing issues with React state updates during render.
  setTimeout(() => {
    listeners.forEach((cb) => {
      try {
        cb(event, session);
      } catch (err) {
        console.error('[auth] Error in auth state change listener:', err);
      }
    });
  }, 0);
}

// ─── Token Refresh ────────────────────────────────────────────────────────────

let refreshTimer: ReturnType<typeof setInterval> | null = null;
let isRefreshing = false;

/**
 * Attempt to refresh the access token using the stored refresh token.
 * Returns the new session if successful, null otherwise.
 */
async function performTokenRefresh(): Promise<AuthSession | null> {
  if (isRefreshing) return null;
  isRefreshing = true;

  try {
    const { refreshToken } = await readTokensCached();
    if (!refreshToken) {
      return null;
    }

    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      // Refresh failed — likely the refresh token is expired or revoked.
      // Clear tokens and fire SIGNED_OUT.
      console.warn('[auth] Token refresh failed:', res.status);
      await clearTokens();
      clearCache();
      fireEvent('SIGNED_OUT', null);
      return null;
    }

    const data = await res.json();
    const newAccessToken = data.access_token || data.accessToken;
    const newRefreshToken = data.refresh_token || data.refreshToken || refreshToken;
    const user = userFromToken(newAccessToken);

    if (!user || !newAccessToken) {
      console.warn('[auth] Token refresh returned invalid data');
      await clearTokens();
      clearCache();
      fireEvent('SIGNED_OUT', null);
      return null;
    }

    const session: AuthSession = {
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      user,
    };

    await storeTokens(newAccessToken, newRefreshToken, user);
    cacheTokens(newAccessToken, newRefreshToken, user);
    fireEvent('TOKEN_REFRESHED', session);
    return session;
  } catch (err) {
    console.error('[auth] Token refresh error:', err);
    return null;
  } finally {
    isRefreshing = false;
  }
}

/**
 * The periodic check that runs every REFRESH_INTERVAL_MS.
 * If the stored access token is expired or about to expire, attempt a refresh.
 */
function autoRefreshCheck(): void {
  // Use the synchronous cache for the periodic check to avoid awaiting
  if (!cachedAccessToken) return;
  if (isTokenExpiredOrExpiring(cachedAccessToken)) {
    performTokenRefresh();
  }
}

function startAutoRefresh(): void {
  if (refreshTimer) return;
  refreshTimer = setInterval(autoRefreshCheck, REFRESH_INTERVAL_MS);
}

function stopAutoRefresh(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

// ─── Build Session from Cache ─────────────────────────────────────────────────

function buildSessionFromCache(): AuthSession | null {
  if (!cachedAccessToken || !cachedRefreshToken || !cachedUser) return null;
  return {
    access_token: cachedAccessToken,
    refresh_token: cachedRefreshToken,
    user: cachedUser,
  };
}

// ─── Core Auth Object ─────────────────────────────────────────────────────────
//
// This object mimics the supabase.auth.* API shape so that existing code
// that calls auth.getSession(), auth.onAuthStateChange(), etc. can be
// migrated by changing the import without rewriting every callsite.
//

export const auth = {
  // ── Session Management ───────────────────────────────────────────

  /**
   * Get the current session from AsyncStorage.
   * If the access token is expired or about to expire, automatically refresh it.
   * Returns the same shape as supabase.auth.getSession().
   */
  async getSession(): Promise<{ data: { session: AuthSession | null } }> {
    const { accessToken, refreshToken, user } = await readTokensCached();

    // No tokens stored — not authenticated
    if (!accessToken || !refreshToken || !user) {
      return { data: { session: null } };
    }

    // If token is still fresh, return it directly
    if (!isTokenExpiredOrExpiring(accessToken)) {
      return {
        data: {
          session: {
            access_token: accessToken,
            refresh_token: refreshToken,
            user,
          },
        },
      };
    }

    // Token is expired or about to expire — attempt refresh
    const refreshedSession = await performTokenRefresh();
    return { data: { session: refreshedSession } };
  },

  /**
   * Get the current user by calling the backend /api/auth/me endpoint.
   * Returns the same shape as supabase.auth.getUser().
   */
  async getUser(): Promise<{ data: { user: AuthUser | null }; error: any }> {
    try {
      const { data: { session } } = await this.getSession();
      if (!session) {
        return { data: { user: null }, error: null };
      }

      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Failed to fetch user' }));
        return { data: { user: null }, error: new Error(errData.error || 'Failed to fetch user') };
      }

      const data = await res.json();
      const u = data.user || data;
      const user: AuthUser = {
        id: u.id || session.user.id,
        email: u.email || session.user.email,
        user_metadata: u.user_metadata || {},
        created_at: u.created_at,
        email_confirmed: u.email_confirmed,
        email_confirmed_at: u.email_confirmed_at,
        display_name: u.display_name,
        full_name: u.full_name,
        last_sign_in_at: u.last_sign_in_at || u.updated_at,
      };

      return { data: { user }, error: null };
    } catch (err) {
      return { data: { user: null }, error: err };
    }
  },

  // ── Auth Actions ─────────────────────────────────────────────────

  /**
   * Sign in with email + password.
   * POST /api/auth/login
   */
  async signInWithPassword({
    email,
    password,
  }: {
    email: string;
    password: string;
  }): Promise<{ data: { session: AuthSession | null; user: AuthUser | null }; error: any }> {
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Login failed' }));
        return {
          data: { session: null, user: null },
          error: new Error(errData.error || errData.message || 'Login failed'),
        };
      }

      const data = await res.json();
      const accessToken = data.access_token || data.accessToken || data.session?.access_token;
      const refreshToken = data.refresh_token || data.refreshToken || data.session?.refresh_token;

      if (!accessToken) {
        return {
          data: { session: null, user: null },
          error: new Error('No access token in login response'),
        };
      }

      const user = userFromToken(accessToken) || {
        id: data.user?.id || '',
        email: data.user?.email || email,
        user_metadata: data.user?.user_metadata || {},
      };

      const session: AuthSession = {
        access_token: accessToken,
        refresh_token: refreshToken || '',
        user,
      };

      await storeTokens(accessToken, refreshToken || '', user);
      cacheTokens(accessToken, refreshToken || '', user);
      startAutoRefresh();
      fireEvent('SIGNED_IN', session);

      return { data: { session, user }, error: null };
    } catch (err) {
      return {
        data: { session: null, user: null },
        error: err instanceof Error ? err : new Error('Login failed'),
      };
    }
  },

  /**
   * Create a new account.
   * POST /api/auth/signup
   */
  async signUp({
    email,
    password,
    options,
  }: {
    email: string;
    password: string;
    options?: { data?: { display_name?: string }; emailRedirectTo?: string };
  }): Promise<{ data: any; error: any }> {
    try {
      const res = await fetch(`${API_BASE}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          display_name: options?.data?.display_name,
          redirect_to: options?.emailRedirectTo,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { data: null, error: new Error(data.error || data.message || 'Signup failed') };
      }

      // If the API returns tokens (auto-login after signup), store them
      const accessToken = data.access_token || data.accessToken || data.session?.access_token;
      if (accessToken) {
        const refreshToken = data.refresh_token || data.refreshToken || data.session?.refresh_token || '';
        const user = userFromToken(accessToken) || { id: data.user?.id || '', email, user_metadata: {} };
        await storeTokens(accessToken, refreshToken, user);
        cacheTokens(accessToken, refreshToken, user);
        startAutoRefresh();
        const session: AuthSession = { access_token: accessToken, refresh_token: refreshToken, user };
        fireEvent('SIGNED_IN', session);
        return { data: { session, user }, error: null };
      }

      // Otherwise signup succeeded but requires verification
      return { data, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err : new Error('Signup failed') };
    }
  },

  /**
   * Sign out — clears tokens and optionally notifies the backend.
   * POST /api/auth/logout
   */
  async signOut(): Promise<{ error: any }> {
    try {
      const { accessToken } = await readTokensCached();

      // Best-effort: notify backend to revoke the refresh token
      if (accessToken) {
        fetch(`${API_BASE}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }).catch(() => {
          // Fire-and-forget — we clear local state regardless
        });
      }

      await clearTokens();
      clearCache();
      stopAutoRefresh();
      fireEvent('SIGNED_OUT', null);
      return { error: null };
    } catch (err) {
      // Even if something goes wrong, clear tokens
      await clearTokens().catch(() => {});
      clearCache();
      stopAutoRefresh();
      fireEvent('SIGNED_OUT', null);
      return { error: err };
    }
  },

  /**
   * Initiate Google OAuth sign-in.
   * Native: opens an in-app browser via expo-web-browser.
   * Web: redirects to /api/auth/google.
   */
  async signInWithOAuth({
    provider,
    options,
  }: {
    provider: 'google';
    options?: {
      redirectTo?: string;
      skipBrowserRedirect?: boolean;
      queryParams?: Record<string, string>;
    };
  }): Promise<{ data: any; error: any }> {
    try {
      if (Platform.OS === 'web') {
        // Web: full-page redirect to the backend OAuth endpoint
        const redirectTo = options?.redirectTo || window.location.origin;
        const queryParams = new URLSearchParams({
          redirect_to: redirectTo,
          ...(options?.queryParams || {}),
        });

        window.location.href = `${API_BASE}/api/auth/${provider}?${queryParams.toString()}`;

        // This won't return since the browser navigates away
        return { data: { provider, url: `${API_BASE}/api/auth/${provider}` }, error: null };
      }

      // Native: open OAuth in an in-app browser via expo-web-browser
      const redirectTo = options?.redirectTo || makeRedirectUri();
      const oauthUrl = `${API_BASE}/api/auth/${provider}?redirect_to=${encodeURIComponent(redirectTo)}`;

      const result = await WebBrowser.openAuthSessionAsync(oauthUrl, redirectTo);

      if (result.type === 'success') {
        // Parse tokens from the callback URL fragment (#access_token=...&refresh_token=...)
        const fragment = result.url.split('#')[1];
        if (fragment) {
          const params = new URLSearchParams(fragment);
          const access_token = params.get('access_token');
          const refresh_token = params.get('refresh_token');

          if (access_token && refresh_token) {
            const user = userFromToken(access_token);
            if (user) {
              await storeTokens(access_token, refresh_token, user);
              cacheTokens(access_token, refresh_token, user);
              startAutoRefresh();
              const session: AuthSession = { access_token, refresh_token, user };
              fireEvent('SIGNED_IN', session);
              return { data: { session, user }, error: null };
            }
          }
        }

        // Also check query params (?access_token=...&refresh_token=...)
        const queryString = result.url.split('?')[1]?.split('#')[0];
        if (queryString) {
          const params = new URLSearchParams(queryString);
          const access_token = params.get('access_token');
          const refresh_token = params.get('refresh_token');

          if (access_token && refresh_token) {
            const user = userFromToken(access_token);
            if (user) {
              await storeTokens(access_token, refresh_token, user);
              cacheTokens(access_token, refresh_token, user);
              startAutoRefresh();
              const session: AuthSession = { access_token, refresh_token, user };
              fireEvent('SIGNED_IN', session);
              return { data: { session, user }, error: null };
            }
          }
        }
      }

      // User cancelled or no tokens found in the callback
      if (result.type === 'cancel' || result.type === 'dismiss') {
        return { data: null, error: new Error('OAuth cancelled by user') };
      }

      return { data: null, error: new Error('No tokens received from OAuth callback') };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err : new Error('OAuth failed') };
    }
  },

  /**
   * Verify an OTP code (for signup verification, password recovery, etc.).
   * POST /api/auth/verify-otp
   *
   * Also supports token_hash verification for magic-link-style auto-login.
   */
  async verifyOtp({
    email,
    token,
    token_hash,
    type,
  }: {
    email?: string;
    token?: string;
    token_hash?: string;
    type: 'signup' | 'recovery' | 'email' | 'magiclink';
  }): Promise<{ data: { user: AuthUser | null; session: AuthSession | null }; error: any }> {
    try {
      const res = await fetch(`${API_BASE}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token, token_hash, type }),
      });

      const data = await res.json();
      if (!res.ok) {
        return {
          data: { user: null, session: null },
          error: new Error(data.error || data.message || 'OTP verification failed'),
        };
      }

      // If the response includes tokens, establish the session
      const accessToken = data.access_token || data.accessToken || data.session?.access_token;
      if (accessToken) {
        const refreshToken = data.refresh_token || data.refreshToken || data.session?.refresh_token || '';
        const user = userFromToken(accessToken) || {
          id: data.user?.id || '',
          email: data.user?.email || email || '',
          user_metadata: data.user?.user_metadata || {},
        };

        await storeTokens(accessToken, refreshToken, user);
        cacheTokens(accessToken, refreshToken, user);
        startAutoRefresh();
        const session: AuthSession = { access_token: accessToken, refresh_token: refreshToken, user };
        fireEvent('SIGNED_IN', session);
        return { data: { user, session }, error: null };
      }

      // Verification succeeded but no session (e.g., recovery flow where user sets password next)
      const user = data.user
        ? { id: data.user.id, email: data.user.email, user_metadata: data.user.user_metadata || {} }
        : null;
      return { data: { user, session: null }, error: null };
    } catch (err) {
      return {
        data: { user: null, session: null },
        error: err instanceof Error ? err : new Error('OTP verification failed'),
      };
    }
  },

  /**
   * Resend an OTP code.
   * POST /api/auth/send-otp
   */
  async resend({
    type,
    email,
  }: {
    type: 'signup' | 'recovery';
    email: string;
  }): Promise<{ data: any; error: any }> {
    try {
      const res = await fetch(`${API_BASE}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, email }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { data: null, error: new Error(data.error || 'Failed to resend code') };
      }
      return { data, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err : new Error('Failed to resend code') };
    }
  },

  /**
   * Send a password reset email / OTP.
   * POST /api/auth/send-otp (type: 'recovery')
   */
  async resetPasswordForEmail(
    email: string,
    options?: { redirectTo?: string }
  ): Promise<{ data: any; error: any }> {
    try {
      const res = await fetch(`${API_BASE}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'recovery',
          email,
          redirect_to: options?.redirectTo,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { data: null, error: new Error(data.error || 'Failed to send reset email') };
      }
      return { data, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err : new Error('Failed to send reset email') };
    }
  },

  /**
   * Update the current user (e.g., change password).
   * POST /api/auth/update-user
   */
  async updateUser({
    password,
    data: userData,
  }: {
    password?: string;
    data?: Record<string, any>;
  }): Promise<{ data: { user: AuthUser | null }; error: any }> {
    try {
      const { data: { session } } = await this.getSession();
      if (!session) {
        return { data: { user: null }, error: new Error('Not authenticated') };
      }

      const res = await fetch(`${API_BASE}/api/auth/update-user`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...(password !== undefined && { password }),
          ...(userData !== undefined && { user_metadata: userData }),
        }),
      });

      const resData = await res.json();
      if (!res.ok) {
        return { data: { user: null }, error: new Error(resData.error || 'Failed to update user') };
      }

      // If the server returns a new token after password change, store it
      const newAccessToken = resData.access_token || resData.accessToken;
      if (newAccessToken) {
        const newRefreshToken = resData.refresh_token || resData.refreshToken || session.refresh_token;
        const user = userFromToken(newAccessToken) || session.user;
        await storeTokens(newAccessToken, newRefreshToken, user);
        cacheTokens(newAccessToken, newRefreshToken, user);
        return { data: { user }, error: null };
      }

      return { data: { user: session.user }, error: null };
    } catch (err) {
      return { data: { user: null }, error: err instanceof Error ? err : new Error('Failed to update user') };
    }
  },

  /**
   * Manually set session tokens (used for OAuth callback parsing, etc.).
   * Stores the tokens and fires SIGNED_IN event.
   */
  async setSession({
    access_token,
    refresh_token,
  }: {
    access_token: string;
    refresh_token: string;
  }): Promise<{ data: { session: AuthSession | null }; error: any }> {
    try {
      const user = userFromToken(access_token);
      if (!user) {
        return { data: { session: null }, error: new Error('Invalid access token') };
      }

      await storeTokens(access_token, refresh_token, user);
      cacheTokens(access_token, refresh_token, user);
      startAutoRefresh();

      const session: AuthSession = { access_token, refresh_token, user };
      fireEvent('SIGNED_IN', session);

      return { data: { session }, error: null };
    } catch (err) {
      return { data: { session: null }, error: err };
    }
  },

  /**
   * Register a callback for auth state changes.
   * Returns an object with an unsubscribe handle, matching the Supabase API shape.
   *
   * The callback fires immediately with INITIAL_SESSION on registration
   * (via setTimeout so it runs after the current call stack).
   */
  onAuthStateChange(
    callback: AuthChangeCallback
  ): { data: { subscription: { unsubscribe: () => void } } } {
    const id = nextListenerId++;
    listeners.set(id, callback);

    // Fire INITIAL_SESSION asynchronously so the caller can finish setup first.
    // Use the in-memory cache for the initial fire; the module init will have
    // populated it by the time any component registers a listener.
    const session = buildSessionFromCache();
    setTimeout(() => {
      try {
        callback('INITIAL_SESSION', session);
      } catch (err) {
        console.error('[auth] Error in INITIAL_SESSION callback:', err);
      }
    }, 0);

    return {
      data: {
        subscription: {
          unsubscribe: () => {
            listeners.delete(id);
          },
        },
      },
    };
  },
};

// ─── Helper Functions (matching exports from the old supabase.ts) ─────────────

export const isOnboardingComplete = (profile: UserProfile | null): boolean => {
  if (!profile) return false;
  return !!(profile.full_name && profile.date_of_birth && profile.phone);
};

/** Custom OTP signup — sends a 6-digit code, does NOT create the user yet */
export const sendSignupOTP = async (email: string, password: string) => {
  const res = await fetch(`${API_BASE}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to send verification code');
  }
  return data;
};

/** Verify signup OTP and create the user account */
export const verifySignupOTP = async (
  email: string,
  otp: string
): Promise<{ success: boolean; token_hash: string | null; message: string }> => {
  const res = await fetch(`${API_BASE}/api/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Verification failed');
  }
  return data;
};

export const signIn = async (email: string, password: string) => {
  const { data, error } = await auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
};

/**
 * Sign in with Google — platform-aware.
 * Web: full-page redirect via auth.signInWithOAuth.
 * Native: in-app browser via expo-web-browser.
 */
export const signInWithGoogle = async () => {
  if (Platform.OS === 'web') {
    const { error } = await auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
    if (error) throw error;
    return; // browser navigates away
  }

  // Native: open in-app browser
  const { data, error } = await auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: makeRedirectUri(),
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });
  if (error) throw error;
  return data;
};

export const signOut = async () => {
  const { error } = await auth.signOut();
  if (error) throw error;
};

export const getCurrentUser = async () => {
  const { data: { user }, error } = await auth.getUser();
  if (error) throw error;
  return user;
};

/** Send a password reset OTP via the custom backend endpoint */
export const resetPasswordWithOTP = async (email: string) => {
  const res = await fetch(`${API_BASE}/api/auth/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, type: 'recovery' }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to send reset code');
  }
  return data;
};

/**
 * Verify an OTP code (for signup or recovery).
 * Uses the auth.verifyOtp method which calls POST /api/auth/verify-otp.
 */
export const verifyOTP = async (
  email: string,
  token: string,
  type: 'signup' | 'recovery' | 'email'
) => {
  const { data, error } = await auth.verifyOtp({ email, token, type });
  if (error) throw error;
  return data;
};

// ─── Document Operations ──────────────────────────────────────────────────────

export const getDocuments = async (): Promise<SupabaseDocument[]> => {
  const { data: { session } } = await auth.getSession();
  if (!session) throw new Error('User not authenticated');

  const res = await fetch(`${API_BASE}/api/documents`, {
    headers: { 'Authorization': `Bearer ${session.access_token}` },
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: 'Failed to fetch documents' }));
    throw new Error(errData.error || 'Failed to fetch documents');
  }

  const data = await res.json();
  return data.documents || [];
};

export const deleteDocument = async (id: string) => {
  const { data: { session } } = await auth.getSession();
  if (!session) throw new Error('User not authenticated');

  const response = await fetch(`${API_BASE}/api/documents/${id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to delete document');
  }
};

// ─── Profile Operations ───────────────────────────────────────────────────────

export const getUserProfile = async (): Promise<UserProfile | null> => {
  const { data: { session } } = await auth.getSession();
  if (!session) return null;

  const res = await fetch(`${API_BASE}/api/user/profile`, {
    headers: { 'Authorization': `Bearer ${session.access_token}` },
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: 'Failed to fetch profile' }));
    throw new Error(errData.error || 'Failed to fetch profile');
  }

  const data = await res.json();
  return data.profile;
};

export const updateUserProfile = async (updates: Partial<UserProfile>) => {
  const { data: { session } } = await auth.getSession();
  if (!session) throw new Error('User not authenticated');

  const res = await fetch(`${API_BASE}/api/user/profile`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({ error: 'Failed to update profile' }));
    throw new Error(errData.error || 'Failed to update profile');
  }
};

/**
 * Change the user's password.
 * Uses auth.updateUser which calls POST /api/auth/update-user.
 */
export const changePassword = async (newPassword: string) => {
  const { error } = await auth.updateUser({ password: newPassword });
  if (error) throw error;
};

// ─── Module Initialization ────────────────────────────────────────────────────
//
// On module load, populate the in-memory cache from AsyncStorage and start
// auto-refresh if tokens exist. This is async, but we fire-and-forget since
// the first actual getSession() call will await AsyncStorage if the cache
// hasn't been populated yet.
//

(async function initAuth() {
  try {
    const tokens = await readTokens();
    if (tokens.accessToken && tokens.refreshToken && tokens.user) {
      cacheTokens(tokens.accessToken, tokens.refreshToken, tokens.user);
      startAutoRefresh();
    }
  } catch (err) {
    console.error('[auth] Failed to initialize auth from AsyncStorage:', err);
  }
})();

// ─── Default Export ───────────────────────────────────────────────────────────
//
// Export `auth` as both a named export and as a property of a default object
// so that code like `import { auth } from './auth'` and code that destructures
// `supabase.auth` both work.
//

export default { auth };
