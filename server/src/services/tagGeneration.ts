import { query } from '../services/db';

const vllmChatUrl = process.env.VLLM_CHAT_URL || 'https://chat.affinityecho.com';
const cfAccessClientId = process.env.CF_ACCESS_CLIENT_ID!;
const cfAccessClientSecret = process.env.CF_ACCESS_CLIENT_SECRET!;

interface TagGenerationResult {
  success: boolean;
  tags?: string[];
  message?: string;
  progress?: string;
  error?: string;
}

/**
 * Generate tags for a specific document using vLLM Chat API
 */
export async function generateDocumentTags(
  documentId: string
): Promise<TagGenerationResult> {
  try {
    console.log(`🏷️  Generating tags for document: ${documentId}`);

    const { rows: docRows } = await query(
      'SELECT name, category, tags FROM documents WHERE id = $1',
      [documentId]
    );
    const document = docRows[0];
    if (!document) return { success: false, error: 'Document not found' };

    if (document.tags && Array.isArray(document.tags) && document.tags.length > 0) {
      console.log(`✅ Document already has tags:`, document.tags);
      return { success: true, tags: document.tags, message: 'Document already has tags' };
    }

    const { rows: stats } = await query(
      'SELECT id, embedding FROM document_chunks WHERE document_id = $1',
      [documentId]
    );
    const totalChunks = stats.length;
    const chunksWithEmbeddings = stats.filter((chunk: any) => chunk.embedding !== null).length;
    const progress = totalChunks > 0 ? (chunksWithEmbeddings / totalChunks) * 100 : 0;

    if (progress < 60) {
      return {
        success: false,
        message: `Embedding progress is ${progress.toFixed(1)}%. Tags will be generated at 60% completion.`,
        progress: progress.toFixed(1),
      };
    }

    const { rows: sampleChunks } = await query(
      'SELECT chunk_text FROM document_chunks WHERE document_id = $1 AND embedding IS NOT NULL ORDER BY chunk_index ASC LIMIT 10',
      [documentId]
    );
    if (!sampleChunks || sampleChunks.length === 0) {
      return { success: false, error: 'No chunks with embeddings found' };
    }

    const sampleText = sampleChunks.map((c: any) => c.chunk_text).join('\n\n');

    const chatResponse = await fetch(`${vllmChatUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Access-Client-Id': cfAccessClientId,
        'CF-Access-Client-Secret': cfAccessClientSecret,
      },
      body: JSON.stringify({
        model: 'hugging-quants/Meta-Llama-3.1-8B-Instruct-AWQ-INT4',
        messages: [
          {
            role: 'system',
            content: "You are an expert at analyzing legal and financial documents. Generate exactly 5 relevant tags that describe the document's content, purpose, and key topics. Tags should be short (1-3 words), specific, and useful for categorization. Return only a JSON array of 5 strings.",
          },
          {
            role: 'user',
            content: `Document name: ${document.name}\nCategory: ${document.category}\n\nSample content:\n${sampleText}\n\nGenerate exactly 5 relevant tags as a JSON array.`,
          },
        ],
        temperature: 0.3,
        max_tokens: 150,
      }),
    });

    if (!chatResponse.ok) {
      const errorText = await chatResponse.text();
      return { success: false, error: `vLLM Chat API error: ${chatResponse.status} - ${errorText}` };
    }

    const chatData = await chatResponse.json() as any;
    const responseText = chatData.choices[0]?.message?.content?.trim() || '[]';

    let tags: string[] = [];
    try {
      tags = JSON.parse(responseText);
      if (!Array.isArray(tags)) throw new Error('Response is not an array');
      tags = tags.slice(0, 5);
    } catch {
      const matches = responseText.match(/"([^"]+)"/g);
      if (matches && matches.length > 0) {
        tags = matches.slice(0, 5).map((m: string) => m.replace(/"/g, ''));
      } else {
        const categoryTags: Record<string, string[]> = {
          warranty: ['Warranty', 'Product Coverage', 'Repair Terms', 'Guarantee', 'Service'],
          insurance: ['Insurance', 'Policy Coverage', 'Premium', 'Benefits', 'Claims'],
          lease: ['Lease Agreement', 'Rental Terms', 'Property', 'Tenant', 'Duration'],
          employment: ['Employment', 'Job Contract', 'Salary', 'Benefits', 'Terms'],
          contract: ['Contract', 'Agreement', 'Terms', 'Obligations', 'Legal'],
          other: ['Document', 'Legal', 'Agreement', 'Terms', 'Important'],
        };
        tags = categoryTags[document.category] || categoryTags.other;
      }
    }

    await query('UPDATE documents SET tags = $1 WHERE id = $2', [tags, documentId]);
    console.log(`✅ Tags generated and saved:`, tags);

    return { success: true, tags, progress: progress.toFixed(1) };
  } catch (error: any) {
    console.error(`❌ Tag generation error:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Generate tags for all documents that don't have them
 */
export async function generateAllDocumentTags(): Promise<{
  success: boolean;
  total: number;
  processed: number;
  tagged: number;
  skipped: number;
  errors: number;
  results: Array<{
    documentId: string;
    documentName: string;
    status: string;
    tags?: string[];
    message?: string;
  }>;
}> {
  try {
    console.log('🏷️  Starting tag generation for all documents...\n');

    const docsResult = await query(
      "SELECT id, name, tags, category FROM documents WHERE tags IS NULL OR tags = '{}'"
    );
    const documents = docsResult.rows;
    const total = documents.length;

    if (total === 0) {
      return { success: true, total: 0, processed: 0, tagged: 0, skipped: 0, errors: 0, results: [] };
    }

    let processed = 0, tagged = 0, skipped = 0, errors = 0;
    const results: Array<{ documentId: string; documentName: string; status: string; tags?: string[]; message?: string }> = [];

    for (const doc of documents) {
      processed++;
      console.log(`[${processed}/${total}] Processing: ${doc.name} (${doc.id})`);

      const result = await generateDocumentTags(doc.id);

      if (result.success && result.tags) {
        tagged++;
        results.push({ documentId: doc.id, documentName: doc.name, status: 'tagged', tags: result.tags });
      } else if (result.message) {
        skipped++;
        results.push({ documentId: doc.id, documentName: doc.name, status: 'skipped', message: result.message });
      } else {
        errors++;
        results.push({ documentId: doc.id, documentName: doc.name, status: 'error', message: result.error || 'Unknown error' });
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return { success: true, total, processed, tagged, skipped, errors, results };
  } catch (error: any) {
    console.error('❌ Error in tag generation:', error);
    return { success: false, total: 0, processed: 0, tagged: 0, skipped: 0, errors: 1, results: [] };
  }
}
