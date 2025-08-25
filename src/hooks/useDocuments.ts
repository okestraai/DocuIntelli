import { useState, useEffect } from 'react';
import { getDocuments, createDocument, deleteDocument as deleteDocumentFromDB, SupabaseDocument } from '../lib/supabase';
import { apiClient } from '../lib/api';
import type { Document } from '../App';

export interface DocumentUploadRequest {
  name: string;
  category: string;
  file: File;
  expirationDate?: string;
}

export function useDocuments() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      setError(null);
      const docs = await getDocuments();
      setDocuments(docs.map(transformSupabaseDocument));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
      console.error('Failed to load documents:', err);
    } finally {
      setLoading(false);
    }
  };

  const uploadDocuments = async (documentsData: DocumentUploadRequest[]): Promise<Document[]> => {
    try {
      setError(null);
      
      // Upload documents using the API client (which stores locally)
      const uploadedDocs = await apiClient.uploadDocuments(documentsData);
      
      // Transform API response to match our Document interface
      const newDocuments = uploadedDocs.map(doc => ({
        id: doc.id,
        name: doc.name,
        type: doc.type,
        category: doc.category as Document['category'],
        uploadDate: doc.uploadDate,
        size: doc.size,
        status: doc.status,
        expirationDate: doc.expirationDate
      }));
      
      setDocuments(prev => [...prev, ...newDocuments]);
      return newDocuments;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload documents';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  const deleteDocumentById = async (id: string) => {
    try {
      setError(null);
      await apiClient.deleteDocument(id);
      setDocuments(prev => prev.filter(doc => doc.id !== id));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete document';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  useEffect(() => {
    const loadDocs = async () => {
      try {
        setLoading(true);
        setError(null);
        const docs = await apiClient.getDocuments();
        setDocuments(docs.map(doc => ({
          id: doc.id,
          name: doc.name,
          type: doc.type,
          category: doc.category as Document['category'],
          uploadDate: doc.uploadDate,
          size: doc.size,
          status: doc.status,
          expirationDate: doc.expirationDate
        })));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load documents');
        console.error('Failed to load documents:', err);
      } finally {
        setLoading(false);
      }
    };
    
    loadDocs();
  }, []);

  return {
    documents,
    loading,
    error,
    uploadDocuments,
    deleteDocument: deleteDocumentById,
    refetch: async () => {
      try {
        setLoading(true);
        setError(null);
        const docs = await apiClient.getDocuments();
        setDocuments(docs.map(doc => ({
          id: doc.id,
          name: doc.name,
          type: doc.type,
          category: doc.category as Document['category'],
          uploadDate: doc.uploadDate,
          size: doc.size,
          status: doc.status,
          expirationDate: doc.expirationDate
        })));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load documents');
        console.error('Failed to load documents:', err);
      } finally {
        setLoading(false);
      }
    }
  };
}

// Transform Supabase response to match our Document interface
function transformSupabaseDocument(supabaseDoc: SupabaseDocument): Document {
  return {
    id: supabaseDoc.id,
    name: supabaseDoc.name,
    type: supabaseDoc.type,
    category: supabaseDoc.category as Document['category'],
    uploadDate: supabaseDoc.upload_date,
    size: supabaseDoc.size,
    status: supabaseDoc.status,
    expirationDate: supabaseDoc.expiration_date
  };
}

// Helper functions
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const getFileType = (mimeType: string): string => {
  if (mimeType.includes('pdf')) return 'PDF';
  if (mimeType.includes('word')) return 'Word';
  if (mimeType.includes('text')) return 'Text';
  if (mimeType.includes('image')) return 'Image';
  return 'Document';
}