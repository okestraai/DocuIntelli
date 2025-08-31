// API client for document operations using Supabase Edge Functions
import { supabase } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export interface DocumentUploadResponse {
  id: string;
  name: string;
  category: string;
  type: string;
  size: string;
  filePath: string;
  uploadDate: string;
  status: 'active' | 'expiring' | 'expired';
  expirationDate?: string;
}

export interface UploadResponse {
  success: boolean;
  data?: {
    document_id: string;
    file_path: string;
    public_url: string;
    chunks_processed: number;
    file_type: string;
  };
  error?: string;
  details?: string;
}

export interface DocumentUploadRequest {
  name: string;
  category: string;
  file: File;
  expirationDate?: string;
}

export interface SearchResponse {
  success: boolean;
  data?: {
    results: Array<{
      chunk_text: string;
      document_name: string;
      similarity: number;
      document_id: string;
    }>;
    query: string;
  };
  error?: string;
}

// Upload document with metadata using Edge Function
export const uploadDocumentWithMetadata = async (
  file: File, 
  name: string, 
  category: string, 
  expirationDate?: string
): Promise<UploadResponse> => {
  try {
    // Get auth token
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('User not authenticated');
    }

    console.log(`📤 Uploading document: ${name} (${file.name})`);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name);
    formData.append('category', category);
    if (expirationDate) {
      formData.append('expirationDate', expirationDate);
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/upload-document`, {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Upload failed with status ${response.status}`);
    }

    const result = await response.json();
    console.log(`✅ Upload successful:`, result);
    return result;
  } catch (error) {
    console.error('❌ Upload error:', error);
    throw error;
  }
};

// Search documents using Edge Function
export const searchDocuments = async (query: string, limit = 5): Promise<SearchResponse> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('User not authenticated');
    }

    console.log(`🔍 Searching documents with query: "${query}"`);

    const response = await fetch(`${SUPABASE_URL}/functions/v1/search-documents`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        limit
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Search failed with status ${response.status}`);
    }

    const result = await response.json();
    console.log(`✅ Search completed:`, result);
    return result;
  } catch (error) {
    console.error('❌ Search error:', error);
    throw error;
  }
};

// Legacy function for backward compatibility
export const uploadDocument = async (file: File): Promise<UploadResponse> => {
  return uploadDocumentWithMetadata(file, file.name, 'other');
};

// Legacy function for backward compatibility  
export const processDocument = async (documentId: string, textContent?: string) => {
  console.log('📝 Document processing is now handled automatically during upload');
  return { success: true, message: 'Processing handled during upload' };
};