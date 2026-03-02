import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Helper function to get public URL for a file
export const getPublicUrl = (path: string) => {
  const { data } = supabase.storage
    .from('documents')
    .getPublicUrl(path)
  
  return data.publicUrl
}

// Helper function to upload file to storage
export const uploadFileToStorage = async (file: File, path: string) => {
  const { data, error } = await supabase.storage
    .from('documents')
    .upload(path, file)

  if (error) {
    throw error
  }

  return data
}