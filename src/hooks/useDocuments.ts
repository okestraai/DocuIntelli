import { useState, useEffect, useCallback } from 'react';
import { getDocuments, SupabaseDocument, supabase } from '../lib/supabase';
import { uploadDocumentWithMetadata } from '../lib/api';
import type { Document } from '../App';

export interface DocumentUploadRequest {
  name: string;
  category: string;
  files: File[];
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

        const uploadResult = await uploadDocumentWithMetadata(
          docData.files,
          docData.name,
          docData.category,
          docData.expirationDate
        );

        if (!uploadResult.success || !uploadResult.data) {
          throw new Error(uploadResult.error || 'Upload failed');
        }

        console.log(`✅ Document ${index + 1} uploaded successfully:`, {
          document_id: uploadResult.data.document_id
        });

        return uploadResult.data.document_id;
      });

      const uploadedDocIds = await Promise.all(uploadPromises);
      console.log(`🎉 All ${uploadedDocIds.length} documents uploaded successfully`);

      await refetchDocuments();

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

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('User not authenticated');
      }

      const { data: documentFiles, error: filesError } = await supabase
        .from('document_files')
        .select('file_path')
        .eq('document_id', id);

      if (filesError) {
        console.error('Error fetching document files:', filesError);
      }

      if (documentFiles && documentFiles.length > 0) {
        console.log(`🗑️ Deleting ${documentFiles.length} files from storage`);
        const filePaths = documentFiles.map(f => f.file_path);

        const { error: storageError } = await supabase.storage
          .from('documents')
          .remove(filePaths);

        if (storageError) {
          console.error('Storage deletion error:', storageError);
        } else {
          console.log(`✅ Deleted ${filePaths.length} files from storage`);
        }
      }

      const { error: deleteError } = await supabase
        .from('documents')
        .delete()
        .eq('id', id)
        .eq('user_id', session.user.id);

      if (deleteError) {
        console.error('❌ Database delete error:', deleteError);
        throw new Error(deleteError.message);
      }

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