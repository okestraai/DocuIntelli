import { createClient } from '@supabase/supabase-js';
import { processDocumentVLLMEmbeddings as processDocumentEmbeddings } from './vllmEmbeddings';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase configuration for chunking service');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export class TextChunker {
  private static readonly CHUNK_SIZE = 1000;
  private static readonly OVERLAP_SIZE = 100;

  static sanitizeText(text: string): string {
    // Remove null bytes and other problematic characters for PostgreSQL
    let sanitized = text
      .replace(/\0/g, '') // Remove null bytes
      .replace(/\\/g, '\\\\') // Escape backslashes for PostgreSQL
      .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters except \t, \n, \r
      .replace(/\uFFFD/g, '') // Remove replacement character
      .replace(/[\uD800-\uDFFF]/g, ''); // Remove unpaired surrogates

    // Normalize Unicode to NFC (canonical composition)
    try {
      sanitized = sanitized.normalize('NFC');
    } catch (e) {
      console.warn('Unicode normalization failed, using original text');
    }

    return sanitized;
  }

  static chunkText(text: string): string[] {
    if (!text || text.trim().length === 0) {
      return [];
    }

    // Sanitize text first to remove problematic Unicode
    const sanitizedText = this.sanitizeText(text);

    const chunks: string[] = [];
    const sentences = this.splitIntoSentences(sanitizedText);
    let currentChunk = '';

    for (const sentence of sentences) {
      // If a single sentence exceeds CHUNK_SIZE, split it at word boundaries
      if (sentence.length > this.CHUNK_SIZE) {
        // Push any accumulated chunk first
        if (currentChunk.trim()) {
          const cleanChunk = this.sanitizeText(currentChunk.trim());
          if (cleanChunk.length > 50) {
            chunks.push(cleanChunk);
          }
        }

        const subChunks = this.splitAtWordBoundary(sentence);
        for (const sub of subChunks) {
          const cleanSub = this.sanitizeText(sub.trim());
          if (cleanSub.length > 50) {
            chunks.push(cleanSub);
          }
        }

        // Start next chunk with overlap from the last sub-chunk
        const lastSub = subChunks[subChunks.length - 1] || '';
        const words = lastSub.split(' ');
        const overlapWords = words.slice(-Math.floor(this.OVERLAP_SIZE / 6));
        currentChunk = overlapWords.join(' ');
        continue;
      }

      if (currentChunk.length + sentence.length > this.CHUNK_SIZE) {
        if (currentChunk.trim()) {
          const cleanChunk = this.sanitizeText(currentChunk.trim());
          if (cleanChunk.length > 50) {
            chunks.push(cleanChunk);
          }
        }
        const words = currentChunk.split(' ');
        const overlapWords = words.slice(-Math.floor(this.OVERLAP_SIZE / 6));
        currentChunk = overlapWords.join(' ') + ' ' + sentence;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      }
    }

    if (currentChunk.trim()) {
      const cleanChunk = this.sanitizeText(currentChunk.trim());
      if (cleanChunk.length > 50) {
        chunks.push(cleanChunk);
      }
    }

    return chunks.filter((chunk) => chunk && chunk.length > 50);
  }

  private static splitAtWordBoundary(text: string): string[] {
    const words = text.split(' ');
    const subChunks: string[] = [];
    let current = '';

    for (const word of words) {
      if (current.length + word.length + 1 > this.CHUNK_SIZE) {
        if (current.trim()) {
          subChunks.push(current.trim());
        }
        current = word;
      } else {
        current += (current ? ' ' : '') + word;
      }
    }

    if (current.trim()) {
      subChunks.push(current.trim());
    }

    return subChunks;
  }

  private static splitIntoSentences(text: string): string[] {
    const cleanText = text.replace(/\s+/g, ' ').trim();
    // Split on sentence-ending punctuation followed by space,
    // or on semicolons/colons followed by space,
    // or on double newlines (paragraph breaks, normalized to spaces above)
    const sentences = cleanText.split(/(?<=[.!?])\s+(?=[A-Z])|(?<=[;:])\s+(?=[A-Z])|(?<=[.!?])\s+(?=["'\u201C\u2018])/);
    return sentences.filter((sentence) => sentence.trim().length > 0);
  }
}

export async function processDocument(documentId: string): Promise<{
  success: boolean;
  chunksProcessed?: number;
  embeddingStatus?: string;
  error?: string;
}> {
  try {
    console.log(`📄 Processing document: ${documentId}`);

    // Fetch document from database
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, user_id, name, processed, file_path, type')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      console.error('Document not found:', docError);
      return { success: false, error: 'Document not found' };
    }

    if (document.processed) {
      console.log('Document already processed');
      return { success: true, chunksProcessed: 0 };
    }

    // Download file from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(document.file_path);

    if (downloadError || !fileData) {
      console.error('Failed to download file:', downloadError);
      return { success: false, error: 'Failed to download file from storage' };
    }

    // Extract text from file
    const text = await fileData.text();
    const sanitizedText = TextChunker.sanitizeText(text);

    if (!sanitizedText || sanitizedText.trim().length === 0) {
      console.error('No text content found');
      return { success: false, error: 'No text content found in document' };
    }

    console.log(`📝 Extracted ${sanitizedText.length} characters`);

    // Chunk the text
    const textChunks = TextChunker.chunkText(sanitizedText);
    console.log(`✂️  Created ${textChunks.length} chunks`);

    if (textChunks.length === 0) {
      console.error('No valid chunks created');
      return { success: false, error: 'No valid text chunks could be created' };
    }

    // Prepare chunks for insertion
    const documentChunks = textChunks.map((chunkText, i) => ({
      document_id: document.id,
      user_id: document.user_id,
      chunk_index: i,
      chunk_text: chunkText,
      embedding: null,
    }));

    // Insert chunks into database
    const { data: insertedChunks, error: insertError } = await supabase
      .from('document_chunks')
      .insert(documentChunks)
      .select('id');

    if (insertError) {
      console.error('Chunk insert error:', insertError);
      return {
        success: false,
        error: `Failed to save document chunks: ${insertError.message}`,
      };
    }

    console.log(`✅ Inserted ${insertedChunks?.length || 0} chunks`);

    // Mark document as processed
    await supabase
      .from('documents')
      .update({ processed: true })
      .eq('id', document.id);

    console.log('✅ Document chunking completed');

    // Trigger embedding generation with better error handling
    let embeddingStatus = 'pending';
    try {
      console.log('🧮 Triggering vLLM embedding generation...');

      // Start embedding generation (non-blocking but with logging)
      processDocumentEmbeddings(document.id)
        .then((result) => {
          if (result.success) {
            console.log(
              `✅ Embeddings generated for document ${document.id}: ${result.processed} chunks processed`
            );
          } else {
            console.error(
              `⚠️  Embedding generation failed for document ${document.id}: ${result.error}`
            );
            console.error(
              '   Document has chunks but no embeddings - will be processed by automatic monitor'
            );
          }
        })
        .catch((err) => {
          console.error(
            `❌ Embedding generation error for document ${document.id}:`,
            err.message
          );
          console.error(
            '   Document has chunks but no embeddings - will be processed by automatic monitor'
          );
        });

      embeddingStatus = 'triggered';
    } catch (embeddingError) {
      console.error('Error triggering embeddings:', embeddingError);
      console.error(
        '⚠️  Embeddings not triggered - document will be processed by automatic monitor'
      );
      embeddingStatus = 'failed';
    }

    return {
      success: true,
      chunksProcessed: insertedChunks?.length || 0,
      embeddingStatus,
    };
  } catch (error) {
    console.error('Processing error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function processUnprocessedDocuments(): Promise<{
  processed: number;
  failed: number;
  errors: string[];
}> {
  try {
    // Find all unprocessed documents
    const { data: documents, error } = await supabase
      .from('documents')
      .select('id, name')
      .eq('processed', false)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching unprocessed documents:', error);
      return { processed: 0, failed: 0, errors: [error.message] };
    }

    if (!documents || documents.length === 0) {
      console.log('No unprocessed documents found');
      return { processed: 0, failed: 0, errors: [] };
    }

    console.log(`Found ${documents.length} unprocessed documents`);

    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const doc of documents) {
      console.log(`\nProcessing: ${doc.name} (${doc.id})`);
      const result = await processDocument(doc.id);

      if (result.success) {
        processed++;
        console.log(`✅ Success: ${doc.name}`);
      } else {
        failed++;
        const errorMsg = `${doc.name}: ${result.error}`;
        errors.push(errorMsg);
        console.error(`❌ Failed: ${errorMsg}`);
      }
    }

    return { processed, failed, errors };
  } catch (error) {
    console.error('Error processing batch:', error);
    return {
      processed: 0,
      failed: 0,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}
