// Local embedding service using e5-mistral-7b-instruct
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const embeddingApiUrl = process.env.EMBEDDING_API_URL || 'http://localhost:8001/v1/embeddings';
const embeddingModel = process.env.EMBEDDING_MODEL || 'intfloat/e5-mistral-7b-instruct';
const embeddingDimensions = parseInt(process.env.EMBEDDING_DIMENSIONS || '4096');

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase configuration for local embeddings service');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('🧮 Local Embedding Service Configuration:');
console.log(`   API URL: ${embeddingApiUrl}`);
console.log(`   Model: ${embeddingModel}`);
console.log(`   Dimensions: ${embeddingDimensions}`);

export interface EmbeddingResult {
  success: boolean;
  embedding?: number[];
  error?: string;
  duration?: number;
}

/**
 * Generate embeddings using local API
 */
export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  const startTime = Date.now();

  try {
    const response = await fetch(embeddingApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: embeddingModel,
        input: text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Embedding API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as any;

    if (!result.data || !Array.isArray(result.data) || result.data.length === 0) {
      throw new Error('Invalid embedding response: missing data array');
    }

    const embedding = result.data[0].embedding as number[];

    if (!Array.isArray(embedding) || embedding.length !== embeddingDimensions) {
      throw new Error(
        `Invalid embedding dimensions: expected ${embeddingDimensions}, got ${embedding?.length || 0}`
      );
    }

    const duration = Date.now() - startTime;

    return {
      success: true,
      embedding,
      duration,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Generate embeddings for multiple texts in a single batch request
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<{
  success: boolean;
  embeddings?: number[][];
  errors?: string[];
  duration?: number;
}> {
  const startTime = Date.now();

  try {
    const response = await fetch(embeddingApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: embeddingModel,
        input: texts,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Embedding API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as any;

    if (!result.data || !Array.isArray(result.data)) {
      throw new Error('Invalid batch embedding response');
    }

    const embeddings = result.data.map((item: any) => item.embedding as number[]);

    const duration = Date.now() - startTime;

    return {
      success: true,
      embeddings,
      duration,
    };
  } catch (error) {
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Process embeddings for a specific document
 */
export async function processDocumentEmbeddings(documentId: string): Promise<{
  success: boolean;
  processed?: number;
  error?: string;
}> {
  try {
    console.log(`🧮 Processing embeddings for document: ${documentId}`);

    // Get all chunks for this document without embeddings
    const { data: chunks, error: fetchError } = await supabase
      .from('document_chunks')
      .select('id, chunk_text')
      .eq('document_id', documentId)
      .is('embedding', null)
      .order('chunk_index');

    if (fetchError) {
      throw new Error(`Failed to fetch chunks: ${fetchError.message}`);
    }

    if (!chunks || chunks.length === 0) {
      console.log('   ℹ️  No chunks need embedding');
      return { success: true, processed: 0 };
    }

    console.log(`   📝 Processing ${chunks.length} chunks`);

    // Process in batches of 10 for efficiency
    const batchSize = 10;
    let processed = 0;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const texts = batch.map((c) => c.chunk_text);

      console.log(`   🔄 Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)}`);

      const result = await generateEmbeddingsBatch(texts);

      if (!result.success || !result.embeddings) {
        console.error(`   ❌ Batch failed: ${result.errors?.join(', ')}`);
        continue;
      }

      // Update each chunk with its embedding
      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j];
        const embedding = result.embeddings[j];

        const { error: updateError } = await supabase
          .from('document_chunks')
          .update({ embedding })
          .eq('id', chunk.id);

        if (updateError) {
          console.error(`   ❌ Failed to update chunk ${chunk.id}: ${updateError.message}`);
        } else {
          processed++;
        }
      }

      console.log(`   ✅ Batch completed in ${result.duration}ms`);
    }

    console.log(`✅ Document embeddings completed: ${processed}/${chunks.length} chunks`);

    return { success: true, processed };
  } catch (error) {
    console.error('❌ Document embedding error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Process all chunks without embeddings
 */
export async function processAllEmbeddings(): Promise<{
  success: boolean;
  processed?: number;
  errors?: string[];
}> {
  try {
    console.log('🧮 Processing all chunks without embeddings');

    // Get all chunks without embeddings
    const { data: chunks, error: fetchError } = await supabase
      .from('document_chunks')
      .select('id, chunk_text, document_id')
      .is('embedding', null)
      .order('created_at');

    if (fetchError) {
      throw new Error(`Failed to fetch chunks: ${fetchError.message}`);
    }

    if (!chunks || chunks.length === 0) {
      console.log('✅ All chunks already have embeddings');
      return { success: true, processed: 0 };
    }

    console.log(`📝 Found ${chunks.length} chunks to process`);

    // Process in batches
    const batchSize = 10;
    let processed = 0;
    const errors: string[] = [];

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const texts = batch.map((c) => c.chunk_text);

      console.log(`🔄 Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)}`);

      const result = await generateEmbeddingsBatch(texts);

      if (!result.success || !result.embeddings) {
        const error = `Batch ${i / batchSize + 1} failed: ${result.errors?.join(', ')}`;
        console.error(`❌ ${error}`);
        errors.push(error);
        continue;
      }

      // Update each chunk
      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j];
        const embedding = result.embeddings[j];

        const { error: updateError } = await supabase
          .from('document_chunks')
          .update({ embedding })
          .eq('id', chunk.id);

        if (updateError) {
          console.error(`❌ Chunk ${chunk.id}: ${updateError.message}`);
          errors.push(`Chunk ${chunk.id}: ${updateError.message}`);
        } else {
          processed++;
        }
      }

      console.log(`✅ Batch completed in ${result.duration}ms - ${processed}/${chunks.length} total`);

      // Small delay to avoid overwhelming the API
      if (i + batchSize < chunks.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    console.log(`\n🎉 Processing complete: ${processed}/${chunks.length} chunks`);

    return { success: true, processed, errors: errors.length > 0 ? errors : undefined };
  } catch (error) {
    console.error('❌ Batch processing error:', error);
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}
