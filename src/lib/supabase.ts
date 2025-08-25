import { createClient } from '@supabase/supabase-js'

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
  size: string
  file_path: string
  original_name: string
  upload_date: string
  expiration_date?: string
  status: 'active' | 'expiring' | 'expired'
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
export const uploadDocumentToStorage = async (file: File, userId: string, documentId: string) => {
  const fileExt = file.name.split('.').pop()
  const fileName = `${documentId}.${fileExt}`
  const filePath = `${userId}/${fileName}`

  const { data, error } = await supabase.storage
    .from('documents')
    .upload(filePath, file)

  if (error) throw error
  return data
}

export const createDocument = async (documentData: {
  name: string
  category: string
  type: string
  size: string
  file_path: string
  original_name: string
  expiration_date?: string
}) => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('User not authenticated')

  const { data, error } = await supabase
    .from('documents')
    .insert([{
      ...documentData,
      user_id: user.id,
      upload_date: new Date().toISOString().split('T')[0],
      status: 'active'
    }])
    .select()
    .single()

  if (error) throw error
  return data
}

export const getDocuments = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('User not authenticated')

  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export const deleteDocument = async (id: string) => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('User not authenticated')

  // First get the document to get the file path
  const { data: document } = await supabase
    .from('documents')
    .select('file_path')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (document?.file_path) {
    // Delete from storage
    await supabase.storage
      .from('documents')
      .remove([document.file_path])
  }

  // Delete from database
  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) throw error
}

export const updateDocumentStatus = async (id: string, status: 'active' | 'expiring' | 'expired') => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('User not authenticated')

  const { error } = await supabase
    .from('documents')
    .update({ status, updated_at: new Date().toISOString() })
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
      updated_at: new Date().toISOString()
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

// Social auth functions
export const signInWithGoogle = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`
    }
  })
  
  if (error) throw error
  return data
}

export const signInWithFacebook = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'facebook',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`
    }
  })
  
  if (error) throw error
  return data
}