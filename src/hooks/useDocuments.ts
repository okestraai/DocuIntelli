import { useState, useEffect } from 'react';
import { getDocuments, createDocument, deleteDocument as deleteDocumentFromDB, uploadDocumentToStorage, SupabaseDocument } from '../lib/supabase';
import { uploadDocumentWithMetadata, processDocument } from '../lib/api';
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


  const uploadDocuments = async (documentsData: DocumentUploadRequest[]): Promise<Document[]> => {
    try {
      setError(null);
      
      const uploadPromises = documentsData.map(async (docData) => {
        // Upload file to Supabase Storage using Edge Function
        const uploadResult = await uploadDocumentWithMetadata(
          docData.file,
          docData.name,
          docData.category,
          docData.expirationDate
        );
        
        if (!uploadResult.success || !uploadResult.data) {
          throw new Error(uploadResult.error || 'Upload failed');
        }

        console.log('✅ Document uploaded via Edge Function:', uploadResult.data);

        // Process document for text extraction and chunking (optional)
        try {
          const processingResult = await processDocument(uploadResult.data.document_id);
          console.log('✅ Document processed:', processingResult);
        } catch (processingError) {
          console.warn('⚠️ Document processing failed (non-critical):', processingError);
          // Continue even if processing fails - the document is still uploaded
        }
        
        // Fetch the created document from database
        const docs = await getDocuments();
        const newDocument = docs.find(doc => doc.id === uploadResult.data!.document_id);
        
        if (!newDocument) {
          throw new Error('Document was uploaded but not found in database');
        }
        
        return transformSupabaseDocument(newDocument);
      });

      const uploadedDocs = await Promise.all(uploadPromises);
      
      setDocuments(prev => [...prev, ...uploadedDocs]);
      return uploadedDocs;
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
    const loadDocs = async () => {
      try {
        setLoading(true);
        setError(null);
        console.log('Loading documents from Supabase...');
        const docs = await getDocuments();
        console.log('Loaded documents:', docs);
        const transformedDocs = docs.map(transformSupabaseDocument);
        setDocuments(transformedDocs);
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
        console.log('Refetching documents from Supabase...');
        const docs = await getDocuments();
        console.log('Refetched documents:', docs);
        const transformedDocs = docs.map(transformSupabaseDocument);
        setDocuments(transformedDocs);
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
  // Calculate status based on expiration date
  let status: 'active' | 'expiring' | 'expired' = 'active';
  if (supabaseDoc.expiration_date) {
    const expirationDate = new Date(supabaseDoc.expiration_date);
    const today = new Date();
    const thirtyDaysFromNow = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000));
    
    if (expirationDate < today) {
      status = 'expired';
    } else if (expirationDate <= thirtyDaysFromNow) {
      status = 'expiring';
    }
  }

  return {
    id: supabaseDoc.id,
    name: supabaseDoc.name,
    type: supabaseDoc.type,
    category: supabaseDoc.category as Document['category'],
    uploadDate: supabaseDoc.upload_date,
    size: supabaseDoc.size,
    status: status,
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