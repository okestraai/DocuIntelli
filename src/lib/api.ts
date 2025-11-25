// src/lib/api.ts
// Frontend API helpers
import { supabase } from './supabase';

export interface UploadResponse {
  success: boolean;
  data?: {
    document_id: string;
    file_key: string;
    public_url?: string;
    file_type?: string;
  };
  error?: string;
}

export interface DocumentUploadRequest {
  name: string;
  category: string;
  file: File;
  expirationDate?: string;
}

/**
 * Upload a document with metadata to IBM COS via backend API
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
    const { data: { session } } = await supabase.auth.getSession();
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

    const uploadUrl = 'http://localhost:5000/api/upload';

    console.log('📡 Sending request to backend server');

    // Upload via backend server with proper PDF/DOCX/Image extraction
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
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
 * Chat with a document using AI
 */
export async function chatWithDocument(
  documentId: string,
  question: string
) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('User not authenticated');
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const apiUrl = `${supabaseUrl}/functions/v1/chat-document`;

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      document_id: documentId,
      question,
      user_id: session.user.id,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Chat request failed' }));
    throw new Error(errorData.error || `Chat failed with status ${res.status}`);
  }

  return res.json();
}

/**
 * Load chat history for a document
 */
export async function loadChatHistory(documentId: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('document_chats')
    .select('id, role, content, created_at')
    .eq('user_id', session.user.id)
    .eq('document_id', documentId)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
}
