// API client for document operations
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
    path: string;
    url: string;
    document_id: string;
  };
  error?: string;
}

export interface DocumentUploadRequest {
  name: string;
  category: string;
  file: File;
  expirationDate?: string;
}

// Upload a single document using Edge Function
export const uploadDocument = async (file: File): Promise<UploadResponse> => {
  // Get auth token
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('User not authenticated');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('name', file.name);
  formData.append('category', 'other'); // Default category

  const response = await fetch(`${SUPABASE_URL}/functions/v1/upload-document`, {
    method: 'POST',
    body: formData,
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Upload failed');
  }

  return response.json();
};

// Upload document with metadata using Edge Function
export const uploadDocumentWithMetadata = async (
  file: File, 
  name: string, 
  category: string, 
  expirationDate?: string
): Promise<UploadResponse> => {
  // Get auth token
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('User not authenticated');
  }

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
    throw new Error(errorData.error || 'Upload failed');
  }

  return response.json();
};

// Process document text and generate chunks using Edge Function
export const processDocument = async (documentId: string, textContent?: string) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('User not authenticated');
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/process-document`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      document_id: documentId,
      text_content: textContent
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Processing failed');
  }

  return response.json();
};

// Search documents using Edge Function
export const searchDocuments = async (query: string, limit = 5) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('User not authenticated');
  }

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
    throw new Error(errorData.error || 'Search failed');
  }

  return response.json();
};

// Import supabase client
import { supabase } from './supabase';