import { useState, useEffect, useCallback } from 'react';
import { getDocuments, supabase } from '../lib/supabase';
import type { SupabaseDocument } from '../lib/supabase';
import { uploadDocumentFile, processURLContent, processManualContent } from '../lib/api';
import type { DocumentUploadRequest } from '../lib/api';
import { API_BASE } from '../lib/config';
import type { Document, DocumentCategory } from '../types/document';

export type { DocumentUploadRequest };

export function useDocuments(isAuthenticated: boolean) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const uploadDocuments = async (items: DocumentUploadRequest[]): Promise<string[]> => {
    try {
      setError(null);

      const uploadPromises = items.map(async (item) => {
        let result;

        if (item.type === 'file') {
          result = await uploadDocumentFile(item.fileUri, item.fileName, item.mimeType, item.name, item.category, item.expirationDate);
        } else if (item.type === 'url') {
          result = await processURLContent(item.url, item.name, item.category, item.expirationDate);
        } else if (item.type === 'manual') {
          result = await processManualContent(item.content, item.name, item.category, item.expirationDate);
        } else {
          throw new Error('Invalid document type');
        }

        if (!result.success || !result.data) {
          throw new Error(result.error || 'Processing failed');
        }

        return result.data.document_id;
      });

      const ids = await Promise.all(uploadPromises);
      await refetchDocuments();
      return ids;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to process content';
      setError(msg);
      throw new Error(msg);
    }
  };

  const deleteDocumentById = async (id: string) => {
    try {
      setError(null);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('User not authenticated');

      const res = await fetch(`${API_BASE}/api/documents/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Delete failed' }));
        throw new Error(errorData.error || `Delete failed (${res.status})`);
      }

      setDocuments((prev) => prev.filter((doc) => doc.id !== id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete document';
      setError(msg);
      throw new Error(msg);
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
      const docs = await getDocuments();
      setDocuments(docs.map(transformSupabaseDocument));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    refetchDocuments();
  }, [isAuthenticated, refetchDocuments]);

  return { documents, loading, error, uploadDocuments, deleteDocument: deleteDocumentById, refetch: refetchDocuments };
}

function transformSupabaseDocument(doc: SupabaseDocument): Document {
  let status: 'active' | 'expiring' | 'expired' = 'active';
  if (doc.expiration_date) {
    const exp = new Date(doc.expiration_date);
    const today = new Date();
    const thirtyDays = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    if (exp < today) status = 'expired';
    else if (exp <= thirtyDays) status = 'expiring';
  }

  return {
    id: doc.id,
    user_id: doc.user_id,
    name: doc.name,
    type: doc.type,
    category: doc.category as DocumentCategory,
    size: doc.size || '0 KB',
    file_path: doc.file_path,
    original_name: doc.original_name,
    upload_date: doc.upload_date,
    status,
    expiration_date: doc.expiration_date,
    processed: doc.processed,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
    tags: doc.tags || [],
  };
}
