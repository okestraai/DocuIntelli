/**
 * vLLM Embedding Service
 *
 * Uses the self-hosted vLLM API with Cloudflare Access authentication
 * and instruction-based grounding for better semantic embeddings.
 *
 * API: https://embedder.affinityecho.com
 * Model: intfloat/e5-mistral-7b-instruct (4096 dimensions)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const vllmEmbedderUrl = process.env.VLLM_EMBEDDER_URL || 'https://embedder.affinityecho.com';
const cfAccessClientId = process.env.CF_ACCESS_CLIENT_ID!;
const cfAccessClientSecret = process.env.CF_ACCESS_CLIENT_SECRET!;
const embeddingModel = 'intfloat/e5-mistral-7b-instruct';
const embeddingDimensions = 4096;

const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);

/**
 * Format input text with instruction prefix for better embeddings
 * @param text - The text to embed
 * @param instruction - The task-specific instruction
 * @returns Formatted text with instruction prefix
 */
function formatWithInstruction(text: string, instruction: string): string {
  return `Instruct: ${instruction}\nQuery: ${text}`;
}

/**
 * Generate embedding for a single text using vLLM API
 * @param text - Text to embed
 * @param instruction - Optional instruction for grounding (default: document indexing)
 * @returns Embedding vector
 */
export async function generateVLLMEmbedding(
  text: string,
  instruction: string = 'Represent this document for retrieval'
): Promise<number[]> {
  const startTime = Date.now();

  try {
    // Format text with instruction prefix
    const formattedText = formatWithInstruction(text, instruction);

    const response = await fetch(`${vllmEmbedderUrl}/v1/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Access-Client-Id': cfAccessClientId,
        'CF-Access-Client-Secret': cfAccessClientSecret,
      },
      body: JSON.stringify({
        model: embeddingModel,
        input: [formattedText],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`vLLM Embedding API error: ${response.status} - ${errorText}`);
    }

    const result = (await response.json()) as any;

    if (!result.data || !Array.isArray(result.data) || result.data.length === 0) {
      throw new Error('Invalid embedding response: missing data array');
    }

    const embedding = result.data[0].embedding as number[];

    if (!Array.isArray(embedding) || embedding.length !== embeddingDimensions) {
      throw new Error(
        `Invalid embedding dimensions: expected ${embeddingDimensions}, got ${
          embedding?.length || 0
        }`
      );
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Generated embedding in ${duration}ms (${embeddingDimensions} dims)`);

    return embedding;
  } catch (error: any) {
    console.error('❌ Error generating embedding:', error.message);
    throw error;
  }
}

/**
 * Generate embeddings for multiple texts in batch using vLLM API
 * @param texts - Array of texts to embed
 * @param instruction - Optional instruction for grounding (default: document indexing)
 * @returns Array of embedding vectors
 */
export async function generateVLLMEmbeddingsBatch(
  texts: string[],
  instruction: string = 'Represent this document for retrieval'
): Promise<{
  success: boolean;
  embeddings: number[][];
  duration: number;
}> {
  const startTime = Date.now();

  try {
    // Format all texts with instruction prefix
    const formattedTexts = texts.map((text) => formatWithInstruction(text, instruction));

    console.log(`🧮 Generating embeddings for ${texts.length} texts (batch mode)...`);

    const response = await fetch(`${vllmEmbedderUrl}/v1/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Access-Client-Id': cfAccessClientId,
        'CF-Access-Client-Secret': cfAccessClientSecret,
      },
      body: JSON.stringify({
        model: embeddingModel,
        input: formattedTexts,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`vLLM Embedding API error: ${response.status} - ${errorText}`);
    }

    const result = (await response.json()) as any;

    if (!result.data || !Array.isArray(result.data)) {
      throw new Error('Invalid batch embedding response');
    }

    const embeddings = result.data.map((item: any) => item.embedding as number[]);

    const duration = Date.now() - startTime;
    console.log(
      `✅ Generated ${embeddings.length} embeddings in ${duration}ms (~${(duration / embeddings.length).toFixed(1)}ms per embedding)`
    );

    return {
      success: true,
      embeddings,
      duration,
    };
  } catch (error: any) {
    console.error('❌ Batch embedding error:', error.message);
    throw error;
  }
}

/**
 * Generate embeddings for a query (search use case)
 * Uses query-specific instruction for better search performance
 * @param query - Search query text
 * @returns Embedding vector
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
  const instruction = 'Given a web search query, retrieve relevant passages';
  return generateVLLMEmbedding(query, instruction);
}

/**
 * Generate embeddings for a document (indexing use case)
 * Uses document-specific instruction for better retrieval
 * @param document - Document text
 * @returns Embedding vector
 */
export async function generateDocumentEmbedding(document: string): Promise<number[]> {
  const instruction = 'Represent this document for retrieval';
  return generateVLLMEmbedding(document, instruction);
}

/**
 * Process embeddings for all chunks of a specific document using vLLM API
 * @param documentId - UUID of the document
 * @returns Processing result
 */
export async function processDocumentVLLMEmbeddings(
  documentId: string
): Promise<{
  success: boolean;
  processed: number;
  skipped: number;
  error?: string;
}> {
  try {
    console.log(`🔄 Processing embeddings for document: ${documentId}`);

    // Get all chunks for the document
    const { data: chunks, error: fetchError } = await supabase
      .from('document_chunks')
      .select('id, chunk_text, embedding')
      .eq('document_id', documentId)
      .order('chunk_index', { ascending: true });

    if (fetchError) {
      console.error('❌ Error fetching chunks:', fetchError);
      return {
        success: false,
        processed: 0,
        skipped: 0,
        error: fetchError.message,
      };
    }

    if (!chunks || chunks.length === 0) {
      console.log('⚠️  No chunks found for document');
      return {
        success: true,
        processed: 0,
        skipped: 0,
      };
    }

    // Filter chunks that need embeddings
    const chunksNeedingEmbeddings = chunks.filter((c) => !c.embedding);

    if (chunksNeedingEmbeddings.length === 0) {
      console.log(`✅ All ${chunks.length} chunks already have embeddings`);
      return {
        success: true,
        processed: 0,
        skipped: chunks.length,
      };
    }

    console.log(
      `📝 Processing ${chunksNeedingEmbeddings.length}/${chunks.length} chunks without embeddings`
    );

    // Process in batches of 10
    const batchSize = 10;
    let totalProcessed = 0;

    for (let i = 0; i < chunksNeedingEmbeddings.length; i += batchSize) {
      const batch = chunksNeedingEmbeddings.slice(i, i + batchSize);
      const texts = batch.map((c) => c.chunk_text);

      console.log(
        `🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunksNeedingEmbeddings.length / batchSize)} (${batch.length} chunks)...`
      );

      // Generate embeddings for batch using document instruction
      const { embeddings } = await generateVLLMEmbeddingsBatch(
        texts,
        'Represent this document for retrieval'
      );

      // Update database with embeddings
      for (let j = 0; j < batch.length; j++) {
        // Pass the array directly - Supabase client converts to pgvector format
        const { error: updateError } = await supabase
          .from('document_chunks')
          .update({ embedding: embeddings[j] })
          .eq('id', batch[j].id);

        if (updateError) {
          console.error(`❌ Error updating chunk ${batch[j].id}:`, updateError);
        } else {
          totalProcessed++;
        }
      }

      console.log(`✅ Batch ${Math.floor(i / batchSize) + 1} completed`);

      // Small delay between batches to avoid overwhelming the API
      if (i + batchSize < chunksNeedingEmbeddings.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    console.log(
      `✅ Document processing complete: ${totalProcessed} chunks processed, ${chunks.length - chunksNeedingEmbeddings.length} skipped`
    );

    // Calculate embedding completion percentage
    const totalChunks = chunks.length;
    const chunksWithEmbeddings = totalChunks - chunksNeedingEmbeddings.length + totalProcessed;
    const completionPercentage = (chunksWithEmbeddings / totalChunks) * 100;

    console.log(`📊 Embedding completion: ${completionPercentage.toFixed(1)}%`);

    // Automatically trigger tag generation if embeddings are at least 60% complete
    if (completionPercentage >= 60) {
      console.log('🏷️  Triggering automatic tag generation...');
      try {
        // Call Supabase Edge Function to generate tags
        const tagResponse = await fetch(`${supabaseUrl}/functions/v1/generate-tags`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
          },
          body: JSON.stringify({
            document_id: documentId,
          }),
        });

        if (tagResponse.ok) {
          const tagResult = (await tagResponse.json()) as any;
          if (tagResult.success && tagResult.tags) {
            console.log(`✅ Tags auto-generated: ${tagResult.tags.join(', ')}`);
          } else {
            console.log('ℹ️  Tag generation response:', tagResult.message || 'No tags generated');
          }
        } else {
          console.warn(`⚠️  Tag generation returned ${tagResponse.status}, will retry later`);
        }
      } catch (tagError: any) {
        console.warn('⚠️  Could not trigger tag generation:', tagError.message);
        console.warn('   Tags will be generated by next automatic check');
      }
    } else {
      console.log(`ℹ️  Skipping tag generation (need 60% completion, currently ${completionPercentage.toFixed(1)}%)`);
    }

    return {
      success: true,
      processed: totalProcessed,
      skipped: chunks.length - chunksNeedingEmbeddings.length,
    };
  } catch (error: any) {
    console.error('❌ Error processing document embeddings:', error);
    return {
      success: false,
      processed: 0,
      skipped: 0,
      error: error.message,
    };
  }
}

/**
 * Process all chunks without embeddings across all documents using vLLM API
 * @returns Processing result
 */
export async function processAllVLLMEmbeddings(): Promise<{
  success: boolean;
  processed: number;
  errors: string[];
}> {
  try {
    console.log('🧮 Processing all chunks without embeddings...\n');

    // Get all chunks without embeddings
    const { data: chunks, error: fetchError } = await supabase
      .from('document_chunks')
      .select('id, chunk_text, document_id')
      .is('embedding', null)
      .order('created_at', { ascending: true });

    if (fetchError) {
      console.error('❌ Error fetching chunks:', fetchError);
      return {
        success: false,
        processed: 0,
        errors: [fetchError.message],
      };
    }

    if (!chunks || chunks.length === 0) {
      console.log('✅ No chunks need embeddings');
      return {
        success: true,
        processed: 0,
        errors: [],
      };
    }

    console.log(`📝 Found ${chunks.length} chunks without embeddings\n`);

    // Process in batches of 10
    const batchSize = 10;
    let totalProcessed = 0;
    const errors: string[] = [];

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const texts = batch.map((c) => c.chunk_text);

      console.log(
        `🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)} (${batch.length} chunks)...`
      );

      try {
        // Generate embeddings for batch
        const { embeddings } = await generateVLLMEmbeddingsBatch(
          texts,
          'Represent this document for retrieval'
        );

        // Update database
        for (let j = 0; j < batch.length; j++) {
          // Pass the array directly - Supabase client converts to pgvector format
          const { error: updateError} = await supabase
            .from('document_chunks')
            .update({ embedding: embeddings[j] })
            .eq('id', batch[j].id);

          if (updateError) {
            console.error(`❌ Error updating chunk ${batch[j].id}:`, updateError);
            errors.push(`Chunk ${batch[j].id}: ${updateError.message}`);
          } else {
            totalProcessed++;
          }
        }

        console.log(`✅ Batch ${Math.floor(i / batchSize) + 1} completed`);
      } catch (error: any) {
        console.error(`❌ Batch processing error:`, error.message);
        errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
      }

      // Small delay between batches
      if (i + batchSize < chunks.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    console.log(`\n✅ Processing complete: ${totalProcessed}/${chunks.length} chunks processed`);

    return {
      success: true,
      processed: totalProcessed,
      errors,
    };
  } catch (error: any) {
    console.error('❌ Error processing embeddings:', error);
    return {
      success: false,
      processed: 0,
      errors: [error.message],
    };
  }
}
