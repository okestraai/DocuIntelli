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
      setError(err instanceof Error ? err.message : 'Failed to load documents');
      console.error('Failed to load documents:', err);
    } finally {
      setLoading(false);
    }
  };

  const uploadDocuments = async (documentsData: DocumentUploadRequest[]): Promise<Document[]> => {
    try {
      setError(null);
      const newDocuments: Document[] = [];
      
      for (const docData of documentsData) {
        // Generate unique ID for the document
        const documentId = crypto.randomUUID();
        
        // Get file info
        const fileSize = formatFileSize(docData.file.size);
        const fileType = getFileType(docData.file.type);
        
        // Upload file to Supabase storage
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');
        
        console.log('Uploading document:', { name: docData.name, size: docData.file.size, type: docData.file.type });
        const storageData = await uploadDocumentToStorage(docData.file, user.id, documentId);
        console.log('Storage upload result:', storageData);
        
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
        
        console.log('Document record created:', documentRecord);
        newDocuments.push(transformSupabaseDocument(documentRecord));
      }
      
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
      await deleteDocumentFromDB(id);
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