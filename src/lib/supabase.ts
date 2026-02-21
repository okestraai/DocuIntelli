import { createClient } from '@supabase/supabase-js'
import { getCurrentUTCTimestamp } from './dateUtils'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: true,
    autoRefreshToken: true,
    persistSession: true,
  },
})

// Database types
export interface SupabaseDocument {
  id: string
  user_id: string
  name: string
  category: string
  type: string
  size: string
  file_path: string
  original_name: string
  upload_date: string
  expiration_date?: string
  status: 'active' | 'expiring' | 'expired'
  processed: boolean
  created_at: string
  updated_at: string
  tags?: string[]
}

export interface UserProfile {
  id: string
  display_name?: string
  bio?: string
  full_name?: string
  date_of_birth?: string
  phone?: string
  // Legacy preference columns (kept for backwards compat)
  email_notifications: boolean
  document_reminders: boolean
  security_alerts: boolean
  // Granular notification preference groups
  billing_alerts: boolean
  document_alerts: boolean
  engagement_digests: boolean
  life_event_alerts: boolean
  activity_alerts: boolean
  created_at: string
  updated_at: string
}

export const isOnboardingComplete = (profile: UserProfile | null): boolean => {
  if (!profile) return false
  return !!(profile.full_name && profile.date_of_birth && profile.phone)
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// Document operations
export const getDocuments = async (): Promise<SupabaseDocument[]> => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('User not authenticated')

  console.log('📊 Fetching documents for user:', user.id);
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('❌ Error fetching documents:', error);
    throw error;
  }
  
  console.log(`✅ Fetched ${data?.length || 0} documents from database`);
  return data || []
}

export const deleteDocument = async (id: string) => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('User not authenticated')

  console.log(`🗑️ Deleting document: ${id}`);

  // Use backend API for deletion (handles both IBM COS and database)
  const response = await fetch(`${API_BASE}/api/documents/${id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Failed to delete document');
  }

  console.log(`✅ Document deleted successfully: ${id}`);
}

export const updateDocumentStatus = async (id: string, status: 'active' | 'expiring' | 'expired') => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('User not authenticated')

  const { error } = await supabase
    .from('documents')
    .update({ status, updated_at: getCurrentUTCTimestamp() })
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) throw error
}

// Auth helper functions

// Custom OTP signup — sends a 6-digit code, does NOT create the user yet
export const sendSignupOTP = async (email: string, password: string) => {
  const res = await fetch(`${supabaseUrl}/functions/v1/signup-send-otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
    },
    body: JSON.stringify({ email, password }),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error || 'Failed to send verification code')
  }
  return data
}

// Custom OTP verify — verifies code and creates the user account
export const verifySignupOTP = async (email: string, otp: string): Promise<{ success: boolean; token_hash: string | null; message: string }> => {
  const res = await fetch(`${supabaseUrl}/functions/v1/signup-verify-otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
    },
    body: JSON.stringify({ email, otp }),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error || 'Verification failed')
  }
  return data
}

// Legacy signUp (kept for reference — no longer used in main signup flow)
export const signUp = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`
    }
  })

  if (error) throw error
  return data
}

export const signIn = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) throw error
  return data
}

export const signInWithGoogle = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  })

  if (error) throw error
  return data
}

export const signOut = async () => {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export const getCurrentUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) throw error
  return user
}

// Password reset function (backward compatibility)
export const resetPassword = async (email: string) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`
  })
  if (error) throw error
}

// Password reset function with OTP — uses custom edge function for Mailjet delivery
export const resetPasswordWithOTP = async (email: string) => {
  const res = await fetch(`${supabaseUrl}/functions/v1/password-reset-otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
    },
    body: JSON.stringify({ email }),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error || 'Failed to send reset code')
  }
  return data
}

// Verify OTP code
export const verifyOTP = async (
  email: string,
  token: string,
  type: 'signup' | 'recovery' | 'email'
) => {
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type,
  })
  if (error) throw error
  return data
}

// Resend OTP code
export const resendOTP = async (email: string, type: 'signup' | 'recovery') => {
  if (type === 'signup') {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
    })
    if (error) throw error
  } else {
    // Use custom edge function for recovery resend (Mailjet delivery)
    await resetPasswordWithOTP(email)
  }
}

// Update user profile
export const updateUserProfile = async (updates: {
  display_name?: string;
  bio?: string;
  full_name?: string;
  date_of_birth?: string;
  phone?: string;
  email_notifications?: boolean;
  document_reminders?: boolean;
  security_alerts?: boolean;
  billing_alerts?: boolean;
  document_alerts?: boolean;
  engagement_digests?: boolean;
  life_event_alerts?: boolean;
  activity_alerts?: boolean;
}) => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('User not authenticated')

  // Update auth metadata for display_name, bio, full_name, phone
  if (updates.display_name !== undefined || updates.bio !== undefined || updates.full_name !== undefined || updates.phone !== undefined) {
    const metadataUpdate: Record<string, string | undefined> = {}
    if (updates.display_name !== undefined) metadataUpdate.display_name = updates.display_name
    if (updates.bio !== undefined) metadataUpdate.bio = updates.bio
    if (updates.full_name !== undefined) metadataUpdate.full_name = updates.full_name
    if (updates.phone !== undefined) metadataUpdate.phone = updates.phone
    const { error: authError } = await supabase.auth.updateUser({
      data: metadataUpdate
    })
    if (authError) throw authError
  }

  // Update user_profiles table for all preferences
  const { error: profileError } = await supabase
    .from('user_profiles')
    .upsert({
      id: user.id,
      ...updates,
      updated_at: getCurrentUTCTimestamp()
    })

  if (profileError) throw profileError
}

// Get user profile
export const getUserProfile = async (): Promise<UserProfile | null> => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error && error.code !== 'PGRST116') throw error // PGRST116 is "not found"
  return data
}

// Change password
export const changePassword = async (newPassword: string) => {
  const { error } = await supabase.auth.updateUser({
    password: newPassword
  })
  if (error) throw error
}