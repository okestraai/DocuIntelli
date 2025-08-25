import { useState, useEffect } from 'react';
import { getDocuments, createDocument, deleteDocument as deleteDocumentFromDB, uploadDocumentToStorage, SupabaseDocument } from '../lib/supabase';
import { supabase } from '../lib/supabase';
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
      console.error('Load documents error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const uploadDocuments = async (documentsData: DocumentUploadRequest[]): Promise<Document[]> => {
    try {
      setError(null);
      const newDocuments: Document[] = [];
      
      for (const docData of documentsData) {
        try {
          // Generate unique ID for the document
          const documentId = crypto.randomUUID();
          
          // Get file info
          const fileSize = formatFileSize(docData.file.size);
          const fileType = getFileType(docData.file.type);
          
          // Upload file to Supabase storage
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw new Error('User not authenticated');
          
          const storageData = await uploadDocumentToStorage(docData.file, user.id, documentId);
          
          // Create document record in database
          const documentRecord = await createDocument({
            name: docData.name,
            category: docData.category,
            type: fileType,
            size: fileSize,
            file_path: storageData.path,
            original_name: docData.file.name,
            expiration_date: docData.expirationDate
          });
          
          newDocuments.push(transformSupabaseDocument(documentRecord));
        } catch (docError) {
          console.error('Failed to upload document:', docData.name, docError);
          throw new Error(`Failed to upload ${docData.name}: ${docError instanceof Error ? docError.message : 'Unknown error'}`);
        }
      }
      
      setDocuments(prev => [...prev, ...newDocuments]);
      return newDocuments;
    } catch (err) {
      console.error('Upload documents error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload documents';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  const deleteDocumentById = async (id: string) => {
    try {
      setError(null);
      await deleteDocumentFromDB(id);
      setDocuments(prev => prev.filter(doc => doc.id !== id));
    } catch (err) {
      console.error('Delete document error:', err);
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
    deleteDocument: deleteDocumentById,
    refetch: loadDocuments
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