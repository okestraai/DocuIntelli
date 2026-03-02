import { query } from '../services/db';
import { processDocumentVLLMEmbeddings as processDocumentEmbeddings } from './vllmEmbeddings';
import { generateDocumentTags } from './tagGeneration';
import { downloadFromStorage } from './storage';
import { TextExtractor } from './textExtractor';
import { TextChunker } from './chunking';

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
    const docsResult = await query(
      'SELECT id, name FROM documents ORDER BY created_at DESC'
    );
    const documents = docsResult.rows;

    if (documents.length === 0) {
      console.log('ℹ️  No documents found');
      return result;
    }

    result.totalDocuments = documents.length;
    console.log(`📚 Found ${result.totalDocuments} documents\n`);

    // Check each document for missing embeddings
    for (const doc of documents) {
      const chunksResult = await query(
        'SELECT id, embedding, chunk_index FROM document_chunks WHERE document_id = $1 ORDER BY chunk_index ASC',
        [doc.id]
      );
      const chunks = chunksResult.rows;

      if (chunks.length === 0) {
        console.log(`⚠️  ${doc.name}: No chunks found — attempting recovery...`);
        try {
          // Reset processed flag and re-process locally
          await query('UPDATE documents SET processed = false WHERE id = $1', [doc.id]);

          // Get document file path to re-extract text
          const docInfoResult = await query('SELECT file_path, type FROM documents WHERE id = $1', [doc.id]);
          const docInfo = docInfoResult.rows[0];
          if (docInfo?.file_path) {
            const buffer = await downloadFromStorage(docInfo.file_path);
            const text = await TextExtractor.extractText(buffer, docInfo.type || 'application/pdf');
            if (text && text.trim().length > 0) {
              const textChunks = TextChunker.chunkText(text);
              for (let i = 0; i < textChunks.length; i++) {
                await query(
                  'INSERT INTO document_chunks (document_id, chunk_text, chunk_index) VALUES ($1, $2, $3)',
                  [doc.id, textChunks[i], i]
                );
              }
              await query('UPDATE documents SET processed = true WHERE id = $1', [doc.id]);
              console.log(`   ✅ Recovered ${doc.name}: ${textChunks.length} chunks extracted`);
              result.documentsProcessed++;
              // Trigger embeddings for newly extracted chunks
              try {
                await processDocumentEmbeddings(doc.id);
                console.log(`   🔄 Embeddings generated for ${doc.name}`);
              } catch (embErr: any) {
                console.warn(`   ⚠️  Could not generate embeddings for ${doc.name}:`, embErr.message);
              }
            } else {
              console.log(`   ⚠️  ${doc.name}: Extracted 0 text (file may be empty/unreadable)`);
            }
          }
        } catch (recoverErr: any) {
          console.error(`   ❌ ${doc.name}: Recovery failed:`, recoverErr.message);
          result.errors.push(`${doc.name}: Recovery failed - ${recoverErr.message}`);
        }
        continue;
      }

      result.totalChunks += chunks.length;
      const missingEmbeddings = chunks.filter((c: any) => !c.embedding);
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
        const docDataResult = await query(
          'SELECT tags FROM documents WHERE id = $1',
          [doc.id]
        );
        const docData = docDataResult.rows[0];

        const needsTags =
          !docData?.tags || !Array.isArray(docData.tags) || docData.tags.length === 0;

        if (needsTags) {
          console.log(`🏷️  ${doc.name}: Generating tags...`);
          try {
            const tagResult = await generateDocumentTags(doc.id);
            if (tagResult && tagResult.tags) {
              console.log(`   ✅ Tags generated: ${tagResult.tags.join(', ')}`);
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
