import { useState, useEffect } from 'react';
import { apiClient, DocumentUploadResponse, DocumentUploadRequest } from '../lib/api';
import type { Document } from '../App';

export function useDocuments() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      setError(null);
      const docs = await apiClient.getDocuments();
      setDocuments(docs.map(transformApiDocument));
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
      const uploadedDocs = await apiClient.uploadDocuments(documentsData);
      const newDocuments = uploadedDocs.map(transformApiDocument);
      
      setDocuments(prev => [...prev, ...newDocuments]);
      return newDocuments;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload documents';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  const deleteDocument = async (id: string) => {
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
    loadDocuments();
  }, []);

  return {
    documents,
    loading,
    error,
    uploadDocuments,
    deleteDocument,
    refetch: loadDocuments
  };
}

// Transform API response to match our Document interface
function transformApiDocument(apiDoc: DocumentUploadResponse): Document {
  return {
    id: apiDoc.id,
    name: apiDoc.name,
    type: apiDoc.type,
    category: apiDoc.category as Document['category'],
    uploadDate: apiDoc.uploadDate,
    size: apiDoc.size,
    status: apiDoc.status,
    expirationDate: apiDoc.expirationDate
  };
}