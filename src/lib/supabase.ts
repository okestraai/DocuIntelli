import { createClient } from '@supabase/supabase-js'
import { getCurrentUTCTimestamp } from './dateUtils'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database types
export interface SupabaseDocument {
  id: string
  user_id: string
  name: string
  category: string
  type: string
  size: number
  file_path: string
  original_name: string
  upload_date: string
  expiration_date?: string
  status: 'active' | 'expiring' | 'expired'
  processed: boolean
  created_at: string
  updated_at: string
}

export interface UserProfile {
  id: string
  display_name?: string
  bio?: string
  email_notifications: boolean
  document_reminders: boolean
  security_alerts: boolean
  created_at: string
  updated_at: string
}

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
  const response = await fetch(`http://localhost:5000/api/documents/${id}`, {
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

export const signOut = async () => {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export const getCurrentUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) throw error
  return user
}

// Password reset function
export const resetPassword = async (email: string) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`
  })
  if (error) throw error
}

// Update user profile
export const updateUserProfile = async (updates: {
  display_name?: string;
  bio?: string;
  email_notifications?: boolean;
  document_reminders?: boolean;
  security_alerts?: boolean;
}) => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('User not authenticated')

  // Update auth metadata for display_name and bio
  if (updates.display_name !== undefined || updates.bio !== undefined) {
    const { error: authError } = await supabase.auth.updateUser({
      data: {
        display_name: updates.display_name,
        bio: updates.bio
      }
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