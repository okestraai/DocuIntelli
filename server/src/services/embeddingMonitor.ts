import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { processDocumentVLLMEmbeddings as processDocumentEmbeddings } from './vllmEmbeddings';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);

interface EmbeddingCheckResult {
  totalDocuments: number;
  documentsWithMissingEmbeddings: number;
  totalChunks: number;
  chunksWithoutEmbeddings: number;
  documentsProcessed: number;
  errors: string[];
}

/**
 * Check all documents and ensure they have embeddings for all chunks
 * @returns Result of the check and processing
 */
export async function checkAndProcessMissingEmbeddings(): Promise<EmbeddingCheckResult> {
  console.log('🔍 Checking for documents with missing embeddings...\n');

  const result: EmbeddingCheckResult = {
    totalDocuments: 0,
    documentsWithMissingEmbeddings: 0,
    totalChunks: 0,
    chunksWithoutEmbeddings: 0,
    documentsProcessed: 0,
    errors: [],
  };

  try {
    // Get all documents
    const { data: documents, error: docError } = await supabase
      .from('documents')
      .select('id, name')
      .order('created_at', { ascending: false });

    if (docError) {
      console.error('❌ Error fetching documents:', docError);
      result.errors.push(`Failed to fetch documents: ${docError.message}`);
      return result;
    }

    if (!documents || documents.length === 0) {
      console.log('ℹ️  No documents found');
      return result;
    }

    result.totalDocuments = documents.length;
    console.log(`📚 Found ${result.totalDocuments} documents\n`);

    // Check each document for missing embeddings
    for (const doc of documents) {
      const { data: chunks, error: chunkError } = await supabase
        .from('document_chunks')
        .select('id, embedding, chunk_index')
        .eq('document_id', doc.id)
        .order('chunk_index', { ascending: true });

      if (chunkError) {
        console.error(`❌ Error fetching chunks for ${doc.name}:`, chunkError);
        result.errors.push(`${doc.name}: ${chunkError.message}`);
        continue;
      }

      if (!chunks || chunks.length === 0) {
        console.log(`⚠️  ${doc.name}: No chunks found — attempting recovery via edge function...`);
        try {
          // Reset processed flag so edge function can re-process
          await supabase.from('documents').update({ processed: false }).eq('id', doc.id);

          const processResponse = await fetch(`${supabaseUrl}/functions/v1/process-document`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ document_id: doc.id }),
          });

          if (processResponse.ok) {
            const processResult = await processResponse.json() as { success: boolean; data?: { chunks_processed: number } };
            const recovered = processResult.data?.chunks_processed || 0;
            if (recovered > 0) {
              console.log(`   ✅ Recovered ${doc.name}: ${recovered} chunks extracted`);
              result.documentsProcessed++;
              // Trigger embeddings for newly extracted chunks
              try {
                await fetch(`${supabaseUrl}/functions/v1/generate-embeddings`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ document_id: doc.id, limit: 10, continue_processing: true }),
                });
                console.log(`   🔄 Embedding generation triggered for ${doc.name}`);
              } catch (embErr: any) {
                console.warn(`   ⚠️  Could not trigger embeddings for ${doc.name}:`, embErr.message);
              }
            } else {
              console.log(`   ⚠️  ${doc.name}: Edge function also extracted 0 chunks (file may be empty/unreadable)`);
            }
          } else {
            console.warn(`   ⚠️  ${doc.name}: Edge function returned ${processResponse.status}`);
          }
        } catch (recoverErr: any) {
          console.error(`   ❌ ${doc.name}: Recovery failed:`, recoverErr.message);
          result.errors.push(`${doc.name}: Recovery failed - ${recoverErr.message}`);
        }
        continue;
      }

      result.totalChunks += chunks.length;
      const missingEmbeddings = chunks.filter((c) => !c.embedding);
      result.chunksWithoutEmbeddings += missingEmbeddings.length;

      if (missingEmbeddings.length > 0) {
        result.documentsWithMissingEmbeddings++;
        console.log(
          `🔄 ${doc.name}: ${missingEmbeddings.length}/${chunks.length} chunks missing embeddings`
        );

        // Process missing embeddings
        try {
          const processResult = await processDocumentEmbeddings(doc.id);
          if (processResult.success) {
            result.documentsProcessed++;
            console.log(`✅ ${doc.name}: Processed ${processResult.processed} chunks`);
          } else {
            console.error(`❌ ${doc.name}: Processing failed -`, processResult.error);
            result.errors.push(`${doc.name}: ${processResult.error}`);
          }
        } catch (error: any) {
          console.error(`❌ ${doc.name}: Exception -`, error.message);
          result.errors.push(`${doc.name}: ${error.message}`);
        }

        // Small delay between documents
        await new Promise((resolve) => setTimeout(resolve, 200));
      } else {
        console.log(`✅ ${doc.name}: All ${chunks.length} chunks have embeddings`);

        // Check if document needs tags generated
        const { data: docData } = await supabase
          .from('documents')
          .select('tags')
          .eq('id', doc.id)
          .single();

        const needsTags =
          !docData?.tags || !Array.isArray(docData.tags) || docData.tags.length === 0;

        if (needsTags) {
          console.log(`🏷️  ${doc.name}: Generating tags...`);
          try {
            const tagResponse = await fetch(`${supabaseUrl}/functions/v1/generate-tags`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`,
                'apikey': supabaseKey,
              },
              body: JSON.stringify({
                document_id: doc.id,
              }),
            });

            if (tagResponse.ok) {
              const tagResult = (await tagResponse.json()) as any;
              if (tagResult.success && tagResult.tags) {
                console.log(`   ✅ Tags generated: ${tagResult.tags.join(', ')}`);
              }
            } else {
              console.warn(`   ⚠️  Tag generation returned ${tagResponse.status}`);
            }
          } catch (tagError: any) {
            console.warn(`   ⚠️  Could not generate tags:`, tagError.message);
          }
        }
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log('📊 Embedding Check Summary:');
    console.log(`   Total documents: ${result.totalDocuments}`);
    console.log(
      `   Documents with missing embeddings: ${result.documentsWithMissingEmbeddings}`
    );
    console.log(`   Total chunks: ${result.totalChunks}`);
    console.log(`   Chunks without embeddings: ${result.chunksWithoutEmbeddings}`);
    console.log(`   Documents processed: ${result.documentsProcessed}`);
    console.log(`   Errors: ${result.errors.length}`);
    console.log('='.repeat(70));

    return result;
  } catch (error: any) {
    console.error('❌ Error in embedding check:', error);
    result.errors.push(`System error: ${error.message}`);
    return result;
  }
}

/**
 * Start automatic periodic checking for missing embeddings
 * @param intervalMinutes - How often to check (default: 30 minutes)
 */
export function startEmbeddingMonitor(intervalMinutes: number = 30): NodeJS.Timeout {
  console.log(`🤖 Starting embedding monitor (checking every ${intervalMinutes} minutes)`);

  const intervalMs = intervalMinutes * 60 * 1000;

  // Run immediately on start
  checkAndProcessMissingEmbeddings().catch((err) => {
    console.error('❌ Initial embedding check failed:', err);
  });

  // Then run periodically
  return setInterval(() => {
    console.log(`\n🔔 Scheduled embedding check triggered\n`);
    checkAndProcessMissingEmbeddings().catch((err) => {
      console.error('❌ Scheduled embedding check failed:', err);
    });
  }, intervalMs);
}
