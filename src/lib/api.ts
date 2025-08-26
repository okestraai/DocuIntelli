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

// Mock data for when backend is unavailable
const mockDocuments: DocumentUploadResponse[] = [
  {
    id: '1',
    name: 'Car Insurance Policy',
    category: 'insurance',
    type: 'PDF',
    size: '2.3 MB',
    filePath: '/mock/car-insurance.pdf',
    uploadDate: '2024-01-15',
    status: 'active',
    expirationDate: '2024-12-15'
  },
  {
    id: '2',
    name: 'Laptop Warranty',
    category: 'warranty',
    type: 'PDF',
    size: '1.8 MB',
    filePath: '/mock/laptop-warranty.pdf',
    uploadDate: '2024-01-10',
    status: 'expiring',
    expirationDate: '2024-02-28'
  },
  {
    id: '3',
    name: 'Apartment Lease Agreement',
    category: 'lease',
    type: 'PDF',
    size: '3.1 MB',
    filePath: '/mock/lease-agreement.pdf',
    uploadDate: '2024-01-05',
    status: 'active',
    expirationDate: '2025-06-30'
  },
  {
    id: '4',
    name: 'Home Insurance Policy',
    category: 'insurance',
    type: 'PDF',
    size: '2.8 MB',
    filePath: '/mock/home-insurance.pdf',
    uploadDate: '2023-12-01',
    status: 'expired',
    expirationDate: '2024-01-20'
  },
  {
    id: '5',
    name: 'Phone Warranty',
    category: 'warranty',
    type: 'PDF',
    size: '1.2 MB',
    filePath: '/mock/phone-warranty.pdf',
    uploadDate: '2024-01-08',
    status: 'expiring',
    expirationDate: '2024-02-15'
  },
  {
    id: '6',
    name: 'Employment Contract',
    category: 'employment',
    type: 'PDF',
    size: '2.1 MB',
    filePath: '/mock/employment-contract.pdf',
    uploadDate: '2023-11-15',
    status: 'active',
    expirationDate: '2025-11-15'
  },
  {
    id: '7',
    name: 'Health Insurance Card',
    category: 'insurance',
    type: 'PDF',
    size: '0.8 MB',
    filePath: '/mock/health-insurance.pdf',
    uploadDate: '2024-01-01',
    status: 'expiring',
    expirationDate: '2024-02-10'
  },
  {
    id: '8',
    name: 'Refrigerator Extended Warranty',
    category: 'warranty',
    type: 'PDF',
    size: '1.5 MB',
    filePath: '/mock/fridge-warranty.pdf',
    uploadDate: '2023-08-20',
    status: 'active',
    expirationDate: '2026-08-20'
  },
  {
    id: '9',
    name: 'Internet Service Contract',
    category: 'contract',
    type: 'PDF',
    size: '1.9 MB',
    filePath: '/mock/internet-contract.pdf',
    uploadDate: '2023-10-01',
    status: 'expired',
    expirationDate: '2024-01-10'
  },
  {
    id: '10',
    name: 'Gym Membership Agreement',
    category: 'contract',
    type: 'PDF',
    size: '1.1 MB',
    filePath: '/mock/gym-membership.pdf',
    uploadDate: '2024-01-12',
    status: 'active',
    expirationDate: '2025-01-12'
  }
];

class ApiClient {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
        },
      });

      if (!response.ok) {
        console.warn(`API Error: ${response.status} ${response.statusText}, falling back to mock data`);
        return this.getMockDataForEndpoint<T>(endpoint, options.method);
      }

      return response.json();
    } catch (error) {
      // Handle all fetch errors, network errors, and server errors
      if (error instanceof TypeError || 
          error instanceof Error && (
        error.message === 'Failed to fetch' || 
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('fetch') ||
        error.message.includes('API Error')
      )) {
        console.warn('Backend unavailable, using mock data');
        return this.getMockDataForEndpoint<T>(endpoint, options.method);
      }
      
      // Re-throw other errors
      throw error;
    }
  }

  private getMockDataForEndpoint<T>(endpoint: string, method?: string): T {
    // Return mock data for GET requests
    if (!method || method === 'GET') {
      if (endpoint === '/documents') {
        return mockDocuments as T;
      }
    }
    
    // For other operations, simulate success
    if (method === 'POST' && endpoint === '/documents/upload') {
      // Simulate successful upload
      const mockUpload: DocumentUploadResponse = {
        id: Date.now().toString(),
        name: 'Mock Document',
        category: 'other',
        type: 'PDF',
        size: '1.0 MB',
        filePath: '/mock/uploaded-document.pdf',
        uploadDate: new Date().toISOString().split('T')[0],
        status: 'active'
      };
      return [mockUpload] as T;
    }
    
    if (method === 'DELETE') {
      // Simulate successful deletion
      return { message: 'Document deleted successfully' } as T;
    }

    // Default fallback
    return [] as T;
  }

  async uploadDocuments(documents: DocumentUploadRequest[]): Promise<DocumentUploadResponse[]> {
    try {
      const uploadPromises = documentsData.map(async (doc) => {
        const uploadResult = await uploadDocument(doc.file);
        
        // Transform upload result to match DocumentUploadResponse
        return {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          name: doc.name,
          category: doc.category,
          type: this.getFileType(uploadResult.mimetype),
          size: this.formatFileSize(uploadResult.size),
          filePath: uploadResult.path,
          uploadDate: new Date().toISOString().split('T')[0],
          status: 'active' as const,
          expirationDate: doc.expirationDate
        };
      });

      return Promise.all(uploadPromises);
    } catch (error) {
      console.error('Upload error:', error);
      throw error;
    }
  }

  private getFileType(mimeType: string): string {
    if (mimeType.includes('pdf')) return 'PDF';
    if (mimeType.includes('word')) return 'Word';
    if (mimeType.includes('text')) return 'Text';
    if (mimeType.includes('image')) return 'Image';
    return 'Document';
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  async getDocuments(): Promise<DocumentUploadResponse[]> {
    return this.request<DocumentUploadResponse[]>('/documents');
  }

  async deleteDocument(id: string): Promise<void> {
    return this.request<void>(`/documents/${id}`, {
      method: 'DELETE',
    });
  }
}

export const apiClient = new ApiClient();