// API client for document operations
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

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
  path: string;
  url: string;
  filename: string;
  size: number;
  mimetype: string;
}

export interface DocumentUploadRequest {
  name: string;
  category: string;
  file: File;
}

// Upload a single document to Supabase Storage
export const uploadDocument = async (file: File): Promise<UploadResponse> => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Upload failed');
  }

  return response.json();
};
