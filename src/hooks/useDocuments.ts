import { useState, useEffect, useCallback } from 'react';
import { getDocuments, SupabaseDocument, supabase } from '../lib/supabase';
import { uploadDocumentWithMetadata } from '../lib/api';
import type { Document } from '../App';

export interface DocumentUploadRequest {
  name: string;
  category: string;
  file: File;
  expirationDate?: string;
}

export function useDocuments(isAuthenticated: boolean) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const uploadDocuments = async (documentsData: DocumentUploadRequest[]): Promise<Document[]> => {
    try {
      setError(null);
      console.log(`📤 Starting upload of ${documentsData.length} documents`);
      
      const uploadPromises = documentsData.map(async (docData, index) => {
        console.log(`📄 Uploading document ${index + 1}/${documentsData.length}: ${docData.name}`);
        
        // Upload file using backend API (which uses IBM COS)
        const uploadResult = await uploadDocumentWithMetadata(
          docData.file,
          docData.name,
          docData.category,
          docData.expirationDate
        );
        
        if (!uploadResult.success || !uploadResult.data) {
          throw new Error(uploadResult.error || 'Upload failed');
        }

        console.log(`✅ Document ${index + 1} uploaded successfully:`, {
          document_id: uploadResult.data.document_id,
          file_key: uploadResult.data.file_key,
          file_type: uploadResult.data.file_type
        });

        return uploadResult.data.document_id;
      });

      const uploadedDocIds = await Promise.all(uploadPromises);
      console.log(`🎉 All ${uploadedDocIds.length} documents uploaded successfully`);
      
      // Refresh documents list to get the new uploads
      await refetchDocuments();
      
      // Return the newly uploaded documents
      const newDocuments = documents.filter(doc => uploadedDocIds.includes(doc.id));
      return newDocuments;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload documents';
      console.error('❌ Upload failed:', errorMessage);
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  const deleteDocumentById = async (id: string) => {
    try {
      setError(null);
      console.log(`🗑️ Deleting document: ${id}`);

      // Delete via backend API (which handles both COS and database)
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('User not authenticated');
      }

      const response = await fetch(`http://localhost:5000/api/documents/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

        if (!response.ok) {
          let errorMessage = `Failed to delete document with status ${response.status}`;
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorData.message || errorMessage;
          } catch (_jsonError) {
            console.error('❌ Failed to parse delete response JSON:', _jsonError);
            try {
              const errorText = await response.text();
              console.error(`❌ Delete Error (${response.status}):`, errorText);
              errorMessage = errorText || errorMessage;
            } catch (textError) {
              console.error(`❌ Failed to parse delete error response:`, textError);
            }
          }
          throw new Error(errorMessage);
        }

      // Update local state
      setDocuments(prev => prev.filter(doc => doc.id !== id));
      console.log(`✅ Document deleted successfully`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete document';
      console.error('❌ Delete failed:', errorMessage);
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  const refetchDocuments = useCallback(async () => {
    if (!isAuthenticated) {
      setDocuments([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      console.log('🔄 Fetching documents from Supabase...');
      const docs = await getDocuments();
      console.log(`📊 Loaded ${docs.length} documents from database`);
      const transformedDocs = docs.map(transformSupabaseDocument);
      setDocuments(transformedDocs);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load documents';
      console.error('❌ Failed to load documents:', errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    refetchDocuments();
  }, [isAuthenticated, refetchDocuments]);

  return {
    documents,
    loading,
    error,
    uploadDocuments,
    deleteDocument: deleteDocumentById,
    refetch: refetchDocuments
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

  // Format size from bytes to human-readable string
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return {
    id: supabaseDoc.id,
    name: supabaseDoc.name,
    type: supabaseDoc.type,
    category: supabaseDoc.category as Document['category'],
    uploadDate: supabaseDoc.upload_date,
    size: formatSize(supabaseDoc.size),
    status: status,
    expirationDate: supabaseDoc.expiration_date
  };
}