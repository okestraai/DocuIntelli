import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { DocumentChunk } from '../types';

// Simple UUID regex validator
function isValidUUID(value: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value.trim());
}

export class SupabaseService {
  private supabase: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.supabase = createClient(url, serviceRoleKey);
  }

  // Insert document chunks (with UUID validation + embedding serialization)
  async insertDocumentChunks(chunks: DocumentChunk[]): Promise<void> {
    try {
      // Validate UUIDs and convert embedding
      const safeChunks = chunks.map((chunk) => {
        if (!isValidUUID(chunk.document_id)) {
          throw new Error(`Invalid document_id: ${chunk.document_id}`);
        }
        if (!isValidUUID(chunk.user_id)) {
          throw new Error(`Invalid user_id: ${chunk.user_id}`);
        }

        return {
          ...chunk,
          document_id: chunk.document_id.trim(),
          user_id: chunk.user_id.trim(),
          // ensure Postgres-compatible embedding
          embedding: Array.isArray(chunk.embedding)
            ? `{${chunk.embedding.join(',')}}`
            : chunk.embedding,
        };
      });

      const { data, error } = await this.supabase
        .from('document_chunks')
        .insert(safeChunks)
        .select('*');

      if (error) {
        console.error('❌ Supabase insert error:', error);
        throw error;
      }

      console.log(`✅ Inserted ${data?.length || 0} chunks into document_chunks`);
      if (data && data.length > 0) {
        console.log('🔎 Sample inserted row:', data[0]);
      }
    } catch (error) {
      console.error('❌ Supabase insert exception:', error);
      throw new Error(
        `Failed to insert chunks: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async deleteDocumentChunks(documentId: string, userId: string): Promise<void> {
    try {
      if (!isValidUUID(documentId)) {
        throw new Error(`Invalid document_id: ${documentId}`);
      }
      if (!isValidUUID(userId)) {
        throw new Error(`Invalid user_id: ${userId}`);
      }

      const { data, error } = await this.supabase
        .from('document_chunks')
        .delete()
        .eq('document_id', documentId.trim())
        .eq('user_id', userId.trim())
        .select('*');

      if (error) {
        console.error('❌ Supabase delete error:', error);
        throw error;
      }

      console.log(`✅ Deleted ${data?.length || 0} chunks for document ${documentId}`);
    } catch (error) {
      console.error('❌ Supabase delete exception:', error);
      throw new Error(
        `Failed to delete chunks: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async searchSimilarChunks(
    embedding: number[],
    userId: string,
    limit: number = 5
  ): Promise<any[]> {
    try {
      if (!isValidUUID(userId)) {
        throw new Error(`Invalid user_id: ${userId}`);
      }

      const { data, error } = await this.supabase.rpc('match_document_chunks', {
        query_embedding: embedding,
        match_threshold: 0.7,
        match_count: limit,
        user_id: userId.trim(),
      });

      if (error) {
        console.error('❌ Supabase search error:', error);
        throw error;
      }

      console.log(`✅ Retrieved ${data?.length || 0} similar chunks`);
      return data || [];
    } catch (error) {
      console.error('❌ Supabase search exception:', error);
      throw new Error(
        `Failed to search chunks: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }
}
