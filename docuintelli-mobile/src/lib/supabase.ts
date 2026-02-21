import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { SUPABASE_URL, SUPABASE_ANON_KEY, API_BASE } from './config';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Web needs URL detection to pick up OAuth tokens after redirect.
    // Native must be false — no browser URL to parse.
    detectSessionInUrl: Platform.OS === 'web',
  },
});

// ── Database types ──────────────────────────────────────────────────

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

export const isOnboardingComplete = (profile: UserProfile | null): boolean => {
  if (!profile) return false;
  return !!(profile.full_name && profile.date_of_birth && profile.phone);
};

// ── Auth helpers ────────────────────────────────────────────────────

/** Custom OTP signup — sends a 6-digit code, does NOT create the user yet */
export const sendSignupOTP = async (email: string, password: string) => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/signup-send-otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
    },
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
  const res = await fetch(`${SUPABASE_URL}/functions/v1/signup-verify-otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email, otp }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Verification failed');
  }
  return data;
};

export const signIn = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
};

export const signInWithGoogle = async () => {
  if (Platform.OS === 'web') {
    // Web: full-page redirect. After Google auth, Supabase redirects back
    // to window.location.origin with tokens in the URL hash.
    // detectSessionInUrl: true (set above) lets the Supabase client
    // automatically parse them and establish the session on page load.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
    if (error) throw error;
    return; // browser navigates away — nothing more to do here
  }

  // Native: open Supabase OAuth in an in-app browser
  const redirectTo = makeRedirectUri();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  });

  if (error) throw error;
  if (!data.url) throw new Error('No OAuth URL returned');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type === 'success') {
    const fragment = result.url.split('#')[1];
    if (fragment) {
      const params = new URLSearchParams(fragment);
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');

      if (access_token && refresh_token) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (sessionError) throw sessionError;
      }
    }
  }
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const getCurrentUser = async () => {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) throw error;
  return user;
};

// Password reset with OTP — uses custom edge function for Mailjet delivery
export const resetPasswordWithOTP = async (email: string) => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/password-reset-otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to send reset code');
  }
  return data;
};

export const verifyOTP = async (email: string, token: string, type: 'signup' | 'recovery' | 'email') => {
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type });
  if (error) throw error;
  return data;
};

// ── Document operations ─────────────────────────────────────────────

export const getDocuments = async (): Promise<SupabaseDocument[]> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const deleteDocument = async (id: string) => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const session = (await supabase.auth.getSession()).data.session;
  const response = await fetch(`${API_BASE}/api/documents/${id}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${session?.access_token}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to delete document');
  }
};

// ── Profile operations ──────────────────────────────────────────────

export const getUserProfile = async (): Promise<UserProfile | null> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.from('user_profiles').select('*').eq('id', user.id).single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
};

export const updateUserProfile = async (updates: Partial<UserProfile>) => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  if (updates.display_name !== undefined || updates.bio !== undefined || updates.full_name !== undefined || updates.phone !== undefined) {
    const metadataUpdate: Record<string, string | undefined> = {};
    if (updates.display_name !== undefined) metadataUpdate.display_name = updates.display_name;
    if (updates.bio !== undefined) metadataUpdate.bio = updates.bio;
    if (updates.full_name !== undefined) metadataUpdate.full_name = updates.full_name;
    if (updates.phone !== undefined) metadataUpdate.phone = updates.phone;
    const { error: authError } = await supabase.auth.updateUser({
      data: metadataUpdate,
    });
    if (authError) throw authError;
  }

  const { error: profileError } = await supabase.from('user_profiles').upsert({
    id: user.id,
    ...updates,
    updated_at: new Date().toISOString(),
  });

  if (profileError) throw profileError;
};

export const changePassword = async (newPassword: string) => {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
};
