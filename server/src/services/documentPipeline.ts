/**
 * Shared document processing pipeline.
 * Used by both file upload (upload.ts) and cloud import (cloudStorage.ts).
 * Handles: text extraction → chunking → embeddings → metadata extraction → notifications.
 */
import { query } from './db';
import { TextExtractor } from './textExtractor';
import { processDocumentVLLMEmbeddings } from './vllmEmbeddings';
import { processDocument as reprocessDocument } from './chunking';
import { extractDocumentMetadata } from './metadataExtractor';
import { sendNotificationEmail, resolveUserInfo } from './emailService';

interface ProcessDocumentOptions {
  documentId: string;
  userId: string;
  documentName: string;
  category: string;
  expirationDate?: string | null;
  buffer: Buffer;
  mimeType: string;
}

/**
 * Run the full extraction → chunking → embedding → metadata pipeline.
 * This function is non-blocking (fire-and-forget) — call it without await.
 */
export async function processDocumentPipeline(opts: ProcessDocumentOptions): Promise<void> {
  const { documentId, userId, documentName, category, expirationDate, buffer, mimeType } = opts;

  try {
    let chunksCreated = 0;

    // Attempt 1: Local text extraction
    try {
      const extractionResult = await TextExtractor.extractAndChunk(buffer, mimeType);
      console.log(`✂️ Local extractor created ${extractionResult.chunks.length} text chunks`);

      if (extractionResult.chunks.length > 0) {
        const values: any[] = [];
        const placeholders: string[] = [];
        extractionResult.chunks.forEach(({ index, content }, i) => {
          const offset = i * 4;
          placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
          values.push(documentId, userId, index, content);
        });

        try {
          await query(
            `INSERT INTO document_chunks (document_id, user_id, chunk_index, chunk_text)
             VALUES ${placeholders.join(', ')}`,
            values
          );
          chunksCreated = extractionResult.chunks.length;
          console.log(`✅ Stored ${chunksCreated} chunks in DB`);
          await query('UPDATE documents SET processed = true WHERE id = $1', [documentId]);
          console.log(`✅ Document marked as processed: ${documentId}`);
        } catch (chunkErr: any) {
          console.error('⚠️ Failed to store chunks:', chunkErr.message);
        }
      }
    } catch (localErr: any) {
      console.warn(`⚠️ Local text extraction failed: ${localErr.message}. Will try edge function fallback...`);
    }

    // Attempt 2: Fallback to chunking service if local extraction yielded 0 chunks
    if (chunksCreated === 0) {
      console.log(`⚠️ Local extraction yielded 0 chunks for ${documentId}, falling back to chunking service...`);
      try {
        await query('UPDATE documents SET processed = false WHERE id = $1', [documentId]);
        const processResult = await reprocessDocument(documentId);
        chunksCreated = processResult.chunksProcessed || 0;
        console.log(`🔄 Chunking service fallback: ${chunksCreated} chunks processed`);
      } catch (fallbackErr: any) {
        console.error('⚠️ Chunking service fallback error:', fallbackErr.message);
      }
    }

    if (chunksCreated > 0) {
      // Send processing complete email
      resolveUserInfo(userId).then(userInfo => {
        if (userInfo) {
          sendNotificationEmail(userId, 'document_processing_complete', {
            userName: userInfo.userName,
            documentName,
            category,
            tagsGenerated: 0,
            embeddingsCreated: false,
            expirationDetected: expirationDate || undefined,
          }).catch(() => {});
        }
      });

      // Trigger metadata extraction (non-blocking)
      extractDocumentMetadata(documentId, userId, documentName, category).catch(err => {
        console.error('⚠️ Metadata extraction failed:', err.message);
      });

      // Trigger embedding generation
      console.log(`🔄 Triggering embedding generation for: ${documentId}`);
      processDocumentVLLMEmbeddings(documentId)
        .then(result => {
          if (result.success) {
            console.log(`✅ Embeddings generated: ${result.processed} chunks processed`);
          } else {
            console.error('⚠️ Embedding generation failed:', result.error);
          }
        })
        .catch(embErr => {
          console.error('⚠️ Failed to trigger embedding generation:', embErr.message);
        });
    } else {
      // Both extraction methods failed — notify user
      console.error(`❌ All extraction methods failed for ${documentId} (0 chunks).`);
      resolveUserInfo(userId).then(userInfo => {
        if (userInfo) {
          sendNotificationEmail(userId, 'document_processing_failed', {
            userName: userInfo.userName,
            documentName,
            errorMessage: 'Could not extract text from this file. The document may be empty, image-only, or in an unsupported format.',
          }).catch(() => {});
        }
      });
    }
  } catch (err: any) {
    console.error(`⚠️ Text extraction failed for ${documentId}:`, err.message || err);
    resolveUserInfo(userId).then(userInfo => {
      if (userInfo) {
        sendNotificationEmail(userId, 'document_processing_failed', {
          userName: userInfo.userName,
          documentName,
          errorMessage: err.message || 'An unexpected error occurred during text extraction.',
        }).catch(emailErr => console.error('📧 Processing failed email error:', emailErr));
      }
    });
  }
}
