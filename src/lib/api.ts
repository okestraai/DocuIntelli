// API client for document operations using IBM COS backend
import { supabase } from './supabase';

const API_BASE_URL = '/api';

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
    file_key: string;
    public_url: string;
    file_type: string;
    size: string;
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

export interface PresignedUrlResponse {
  success: boolean;
  data?: {
    upload_url: string;
    file_key: string;
    expires_in: number;
  };
  error?: string;
}

// Upload document with metadata using backend API
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

    const response = await fetch(`${API_BASE_URL}/upload`, {
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

// Get presigned URL for direct client uploads
export const getPresignedUploadUrl = async (
  filename: string,
  contentType: string
): Promise<PresignedUrlResponse> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('User not authenticated');
    }

    console.log(`🔗 Getting presigned URL for: ${filename}`);

    const response = await fetch(
      `${API_BASE_URL}/signed-url?filename=${encodeURIComponent(filename)}&contentType=${encodeURIComponent(contentType)}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Failed to get presigned URL with status ${response.status}`);
    }

    const result = await response.json();
    console.log(`✅ Presigned URL generated:`, result);
    return result;
  } catch (error) {
    console.error('❌ Presigned URL error:', error);
    throw error;
  }
};

// Upload file using presigned URL
export const uploadWithPresignedUrl = async (
  file: File,
  uploadUrl: string
): Promise<boolean> => {
  try {
    console.log(`📤 Uploading via presigned URL: ${file.name}`);

    const response = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type,
      },
    });

    if (!response.ok) {
      throw new Error(`Presigned upload failed with status ${response.status}`);
    }

    console.log(`✅ Presigned upload successful`);
    return true;
  } catch (error) {
    console.error('❌ Presigned upload error:', error);
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

    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
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

// Get download URL for a document
export const getDocumentDownloadUrl = async (documentId: string): Promise<string> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('User not authenticated');
    }

    const response = await fetch(`${API_BASE_URL}/documents/${documentId}/download`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Failed to get download URL with status ${response.status}`);
    }

    const result = await response.json();
    return result.download_url;
  } catch (error) {
    console.error('❌ Download URL error:', error);
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