import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { DocumentChunk } from '../types';

export class SupabaseService {
  private supabase: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.supabase = createClient(url, serviceRoleKey);
  }

  // 🔎 Validate a document exists and fetch real UUIDs
  async getDocumentById(documentId: string, userId: string) {
    const { data, error } = await this.supabase
      .from("documents")
      .select("id, user_id")
      .eq("id", documentId)
      .eq("user_id", userId)
      .single();

    if (error) {
      console.error("❌ getDocumentById error:", error);
      return { data: null, error };
    }

    return { data, error: null };
  }

  async insertDocumentChunks(chunks: DocumentChunk[]): Promise<void> {
  try {
    // Log the first chunk so we can inspect payload shape
    console.log("💾 Attempting to insert chunks, sample payload:", JSON.stringify(chunks[0], null, 2));

    const { data, error } = await this.supabase
      .from('document_chunks')
      .insert(chunks)
      .select(); // force Supabase to return inserted rows

    if (error) {
      console.error("❌ Supabase insert error:", error);
      throw error;
    }

    console.log("✅ Insert result:", data);
  } catch (error) {
    console.error('❌ Supabase insertDocumentChunks failed:', error);
    throw new Error(`Failed to insert chunks: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}


  async deleteDocumentChunks(documentId: string, userId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('document_chunks')
        .delete()
        .eq('document_id', documentId)
        .eq('user_id', userId);

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('❌ Supabase delete error:', error);
      throw new Error(`Failed to delete chunks: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async searchSimilarChunks(embedding: number[], userId: string, limit: number = 5): Promise<any[]> {
    try {
      const { data, error } = await this.supabase.rpc('match_document_chunks', {
        query_embedding: embedding,
        match_threshold: 0.7,
        match_count: limit,
        user_id: userId
      });

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('❌ Supabase search error:', error);
      throw new Error(`Failed to search chunks: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
