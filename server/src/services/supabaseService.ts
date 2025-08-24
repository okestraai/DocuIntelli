import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { DocumentChunk } from '../types';

export class SupabaseService {
  private supabase: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.supabase = createClient(url, serviceRoleKey);
  }

  // Insert document chunks (embeddings)
  async insertDocumentChunks(chunks: DocumentChunk[]): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from('document_chunks')
        .insert(chunks)
        .select('*'); // return inserted rows

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

  // Delete document chunks for a specific doc + user
  async deleteDocumentChunks(documentId: string, userId: string): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from('document_chunks')
        .delete()
        .eq('document_id', documentId)
        .eq('user_id', userId)
        .select('*'); // return deleted rows

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

  // Search similar chunks using pgvector function
  async searchSimilarChunks(
    embedding: number[],
    userId: string,
    limit: number = 5
  ): Promise<any[]> {
    try {
      const { data, error } = await this.supabase.rpc('match_document_chunks', {
        query_embedding: embedding,
        match_threshold: 0.7,
        match_count: limit,
        user_id: userId
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
