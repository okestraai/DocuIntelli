/**
 * Document Processing Routes
 *
 * Converted from Supabase Edge Functions to Express routes.
 * Handles document text extraction, chunking, embedding generation,
 * tag generation, URL/manual content ingestion, and DOCX-to-HTML conversion.
 *
 * Source edge functions:
 *   - process-document
 *   - process-url-content
 *   - process-manual-content
 *   - convert-to-pdf (DOCX → HTML)
 *   - generate-tags
 *   - generate-embeddings
 *   - process-null-embeddings
 *   - scheduled-embedding-processor (merged into process-null-embeddings)
 */

import { Router, Request, Response } from 'express';
import mammoth from 'mammoth';
import { query } from '../services/db';
import { downloadFromStorage, uploadToStorage } from '../services/storage';
import { TextExtractor } from '../services/textExtractor';
import { TextChunker } from '../services/chunking';
import {
  generateVLLMEmbedding,
  processDocumentVLLMEmbeddings,
  processAllVLLMEmbeddings,
} from '../services/vllmEmbeddings';
import { verifyAccessToken } from '../services/authService';

const router = Router();

// ─── Shared Helpers ──────────────────────────────────────────────────────────

/**
 * Extract and verify user from Bearer token.
 * Returns the userId or sends a 401 response and returns null.
 */
function extractUserId(req: Request, res: Response): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ success: false, error: 'Authorization header required' });
    return null;
  }

  const token = authHeader.replace('Bearer ', '');
  try {
    const { userId } = verifyAccessToken(token);
    return userId;
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
    return null;
  }
}

/**
 * Sanitize text for safe PostgreSQL storage.
 */
function sanitizeText(text: string): string {
  let sanitized = text
    .replace(/\0/g, '')
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\uFFFD/g, '')
    .replace(/[\uD800-\uDFFF]/g, '');

  try {
    sanitized = sanitized.normalize('NFC');
  } catch {
    // normalization failed, use as-is
  }

  return sanitized;
}

/**
 * Extract readable text from raw HTML (for URL ingestion).
 */
function extractTextFromHTML(html: string): string {
  let text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, '')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '');

  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '\u2014')
    .replace(/&ndash;/g, '\u2013')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));

  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/blockquote>/gi, '\n\n')
    .replace(/<\/article>/gi, '\n\n')
    .replace(/<\/section>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '\u2022 ')
    .replace(/<h([1-6])[^>]*>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n---\n');

  text = text.replace(/<[^>]+>/g, '');

  text = text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n /g, '\n')
    .replace(/ \n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return sanitizeText(text);
}

/**
 * Simple chunker for manual content (sliding window with overlap).
 */
function chunkTextSimple(text: string, chunkSize = 1000, overlap = 200): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;
    if (start >= text.length) break;
  }

  return chunks;
}

// ─── SSRF protection for URL ingestion ───────────────────────────────────────

const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^169\.254\./,
  /^0\./,
  /^\[?::1\]?$/,
  /^\[?fc00:/i,
  /^\[?fd00:/i,
  /^\[?fe80:/i,
  /^metadata\.google\.internal$/i,
];

function isBlockedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(lower));
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * POST /process
 *
 * Re-process an existing document: download from storage, extract text,
 * chunk, insert into document_chunks, mark as processed, and trigger
 * embedding generation.
 */
router.post('/process', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = extractUserId(req, res);
    if (!userId) return;

    const { document_id } = req.body;

    if (!document_id) {
      res.status(400).json({ success: false, error: 'document_id is required' });
      return;
    }

    // Fetch document with ownership check
    const docResult = await query(
      'SELECT id, user_id, name, processed, file_path, type FROM documents WHERE id = $1 AND user_id = $2',
      [document_id, userId]
    );
    const document = docResult.rows[0];

    if (!document) {
      res.status(404).json({ success: false, error: 'Document not found or access denied' });
      return;
    }

    if (document.processed) {
      res.json({
        success: true,
        data: {
          chunks_processed: 0,
          document_id,
          message: 'Document already processed',
        },
      });
      return;
    }

    console.log(`Processing document: ${document.name}`);

    // Download file from Azure Blob Storage
    let fileBuffer: Buffer;
    try {
      fileBuffer = await downloadFromStorage(document.file_path);
    } catch (downloadError) {
      console.error('Failed to download file:', downloadError);
      res.status(500).json({
        success: false,
        error: 'Failed to download file from storage',
        details: downloadError instanceof Error ? downloadError.message : 'Unknown error',
      });
      return;
    }

    // Extract text using the full TextExtractor (supports PDF, DOCX, images via OCR)
    let extractedText: string;
    try {
      extractedText = await TextExtractor.extractText(fileBuffer, document.type);
      console.log(`Extracted ${extractedText.length} characters`);
    } catch (extractError) {
      console.error('Text extraction failed:', extractError);
      res.status(500).json({
        success: false,
        error: 'Failed to extract text from document',
        details: extractError instanceof Error ? extractError.message : 'Unknown error',
      });
      return;
    }

    if (!extractedText || extractedText.trim().length === 0) {
      res.status(400).json({ success: false, error: 'No text content found in document' });
      return;
    }

    // Chunk the text
    const textChunks = TextChunker.chunkText(extractedText);
    console.log(`Created ${textChunks.length} chunks`);

    if (textChunks.length === 0) {
      res.status(400).json({ success: false, error: 'No valid text chunks could be created' });
      return;
    }

    // Build multi-row INSERT
    const values: any[] = [];
    const valueClauses: string[] = [];
    let paramIdx = 1;
    for (let i = 0; i < textChunks.length; i++) {
      valueClauses.push(
        `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4})`
      );
      values.push(document.id, document.user_id, i, textChunks[i], null);
      paramIdx += 5;
    }

    const insertResult = await query(
      `INSERT INTO document_chunks (document_id, user_id, chunk_index, chunk_text, embedding)
       VALUES ${valueClauses.join(', ')}
       RETURNING id`,
      values
    );

    const insertedCount = insertResult.rows.length;
    console.log(`Inserted ${insertedCount} chunks`);

    // Mark document as processed
    await query('UPDATE documents SET processed = true WHERE id = $1', [document.id]);

    // Trigger embedding generation (fire-and-forget)
    console.log('Triggering embedding generation...');
    processDocumentVLLMEmbeddings(document.id).catch((err) => {
      console.error('Embedding trigger error:', err);
    });

    res.json({
      success: true,
      data: {
        chunks_processed: insertedCount,
        document_id: document.id,
      },
    });
  } catch (error) {
    console.error('Process document error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /process-url
 *
 * Fetch a URL, extract text from the HTML, store as a text document,
 * chunk it, and trigger embedding generation.
 */
router.post('/process-url', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = extractUserId(req, res);
    if (!userId) return;

    const { url, name, category, expirationDate } = req.body;

    if (!url || !name || !category) {
      res.status(400).json({ success: false, error: 'URL, name, and category are required' });
      return;
    }

    // SSRF protection: validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);

      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        res.status(400).json({ success: false, error: 'Only HTTP and HTTPS URLs are allowed' });
        return;
      }

      if (isBlockedHost(parsedUrl.hostname)) {
        res.status(400).json({
          success: false,
          error: 'URLs pointing to internal or private networks are not allowed',
        });
        return;
      }
    } catch {
      res.status(400).json({ success: false, error: 'Invalid URL format' });
      return;
    }

    // Fetch URL with timeout
    let htmlResponse: globalThis.Response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      htmlResponse = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DocuIntelliBot/1.0)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!htmlResponse.ok) {
        res.status(400).json({
          success: false,
          error: `Failed to fetch URL: ${htmlResponse.status} ${htmlResponse.statusText}`,
        });
        return;
      }
    } catch (fetchError) {
      res.status(400).json({
        success: false,
        error:
          fetchError instanceof Error && fetchError.name === 'AbortError'
            ? 'URL fetch timeout (30s limit)'
            : 'Failed to fetch URL. Please check if the URL is accessible.',
      });
      return;
    }

    const html = await htmlResponse.text();
    const extractedText = extractTextFromHTML(html);

    if (!extractedText || extractedText.length < 50) {
      res.status(400).json({
        success: false,
        error:
          'Insufficient content extracted from URL. The page may be empty or requires JavaScript.',
      });
      return;
    }

    // Upload extracted text to Azure Blob Storage
    const textBuffer = Buffer.from(extractedText, 'utf-8');
    const sanitizedName = name.replace(/[^a-zA-Z0-9-_]/g, '_');
    const timestamp = Date.now();
    const fileName = `${timestamp}_${sanitizedName}.txt`;

    const uploadResult = await uploadToStorage(textBuffer, userId, fileName, 'text/plain');

    if (!uploadResult.success || !uploadResult.filePath) {
      res.status(500).json({
        success: false,
        error: 'Failed to upload content to storage',
        details: uploadResult.error,
      });
      return;
    }

    const sizeInKB = Math.round(textBuffer.length / 1024);
    const sizeText = sizeInKB > 0 ? `${sizeInKB} KB` : '1 KB';

    // Create document record
    const docResult = await query(
      `INSERT INTO documents (user_id, name, original_name, type, category, expiration_date, size, file_path, status, source_type, source_url, processed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        userId,
        name,
        name,
        'text/plain',
        category,
        expirationDate || null,
        sizeText,
        uploadResult.filePath,
        'active',
        'url',
        url,
        false,
      ]
    );

    const documentRow = docResult.rows[0];
    if (!documentRow) {
      // Rollback: delete the uploaded file
      const { deleteFromStorage } = await import('../services/storage');
      await deleteFromStorage(uploadResult.filePath);
      res.status(500).json({ success: false, error: 'Failed to create document record' });
      return;
    }

    // Trigger processing (fire-and-forget): chunk + embed
    processDocumentInBackground(documentRow.id).catch((err) => {
      console.error(`Background processing error for ${documentRow.id}:`, err);
    });

    res.json({
      success: true,
      data: {
        document_id: documentRow.id,
        content_length: extractedText.length,
        message: 'URL content saved. Processing will complete shortly.',
      },
    });
  } catch (error) {
    console.error('Process URL error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * POST /process-manual
 *
 * Create a document from pasted text content, chunk it, and trigger
 * embedding generation.
 */
router.post('/process-manual', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = extractUserId(req, res);
    if (!userId) return;

    const { content, name, category, expirationDate } = req.body;

    if (!content || !name || !category) {
      res.status(400).json({ success: false, error: 'Content, name, and category are required' });
      return;
    }

    const cleanedContent = sanitizeText(content.trim());

    if (cleanedContent.length < 50) {
      res.status(400).json({
        success: false,
        error: 'Content must be at least 50 characters long',
      });
      return;
    }

    console.log(`Processing manual content: ${cleanedContent.length} characters`);

    const sizeInKB = Math.round(cleanedContent.length / 1024);
    const sizeText = sizeInKB > 0 ? `${sizeInKB} KB` : '1 KB';

    // Create document record (no file_path for manual content)
    const docResult = await query(
      `INSERT INTO documents (user_id, name, original_name, type, category, expiration_date, size, file_path, status, source_type, content_text, upload_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        userId,
        name,
        name,
        'text/plain',
        category,
        expirationDate || null,
        sizeText,
        null,
        'active',
        'manual',
        cleanedContent,
        new Date().toISOString(),
      ]
    );

    const documentRow = docResult.rows[0];
    if (!documentRow) {
      res.status(500).json({ success: false, error: 'Failed to create document record' });
      return;
    }

    console.log(`Document created with ID: ${documentRow.id}`);

    // Chunk text
    const chunks = chunkTextSimple(cleanedContent);
    console.log(`Created ${chunks.length} chunks`);

    // Build multi-row INSERT for chunks
    const values: any[] = [];
    const valueClauses: string[] = [];
    let paramIdx = 1;
    for (let i = 0; i < chunks.length; i++) {
      valueClauses.push(
        `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3})`
      );
      values.push(documentRow.id, i, chunks[i], null);
      paramIdx += 4;
    }

    const insertResult = await query(
      `INSERT INTO document_chunks (document_id, chunk_index, chunk_text, embedding)
       VALUES ${valueClauses.join(', ')}`,
      values
    );

    if (insertResult.rowCount === 0) {
      // Rollback: delete document
      await query('DELETE FROM documents WHERE id = $1', [documentRow.id]);
      res.status(500).json({ success: false, error: 'Failed to create document chunks' });
      return;
    }

    // Trigger embedding generation (fire-and-forget)
    console.log('Generating embeddings for chunks...');
    processDocumentVLLMEmbeddings(documentRow.id).catch((err) => {
      console.error('Embedding generation error:', err);
    });

    res.json({
      success: true,
      data: {
        document_id: documentRow.id,
        chunks_created: chunks.length,
        content_length: cleanedContent.length,
      },
    });
  } catch (error) {
    console.error('Manual content processing error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

/**
 * POST /convert-to-pdf
 *
 * Download a DOCX file from storage and convert it to styled HTML
 * using mammoth. Returns the HTML directly.
 */
router.post('/convert-to-pdf', async (req: Request, res: Response): Promise<void> => {
  try {
    const { filePath } = req.body;

    if (!filePath) {
      res.status(400).json({ error: 'File path is required' });
      return;
    }

    console.log('Converting document to HTML:', filePath);

    // Download file from Azure Blob Storage
    const fileBuffer = await downloadFromStorage(filePath);
    console.log('File downloaded, size:', fileBuffer.length);

    // Convert DOCX to HTML using mammoth
    const result = await mammoth.convertToHtml({ buffer: fileBuffer });
    const html = result.value;
    const messages = result.messages;

    if (messages.length > 0) {
      console.log('Conversion messages:', messages);
    }

    console.log('Converted to HTML, length:', html.length);

    const styledHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: 'Calibri', 'Arial', sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 40px auto;
      padding: 20px;
      color: #333;
    }
    p { margin: 12px 0; }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 24px;
      margin-bottom: 16px;
      font-weight: bold;
    }
    h1 { font-size: 2em; }
    h2 { font-size: 1.5em; }
    h3 { font-size: 1.17em; }
    ul, ol { margin: 12px 0; padding-left: 40px; }
    li { margin: 6px 0; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    td, th { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; font-weight: bold; }
    img { max-width: 100%; height: auto; }
  </style>
</head>
<body>
${html}
</body>
</html>
`;

    res.setHeader('Content-Type', 'text/html');
    res.send(styledHtml);
  } catch (error) {
    console.error('Error in convert-to-pdf:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});

/**
 * POST /generate-tags
 *
 * Generate AI tags for a document using the vLLM Chat API.
 * Requires at least 60% of chunks to have embeddings before generating.
 */
router.post('/generate-tags', async (req: Request, res: Response): Promise<void> => {
  try {
    const { document_id } = req.body;

    if (!document_id) {
      res.status(400).json({ error: 'document_id is required' });
      return;
    }

    console.log(`Generating tags for document: ${document_id}`);

    const vllmChatUrl = process.env.VLLM_CHAT_URL || 'https://chat.affinityecho.com';
    const cfAccessClientId = process.env.CF_ACCESS_CLIENT_ID;
    const cfAccessClientSecret = process.env.CF_ACCESS_CLIENT_SECRET;

    if (!cfAccessClientId || !cfAccessClientSecret) {
      res.status(500).json({ error: 'Cloudflare Access credentials not configured' });
      return;
    }

    // Fetch document metadata
    const docResult = await query(
      'SELECT name, category, tags FROM documents WHERE id = $1',
      [document_id]
    );
    const document = docResult.rows[0];

    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    // Already has tags
    if (document.tags && Array.isArray(document.tags) && document.tags.length > 0) {
      console.log('Document already has tags:', document.tags);
      res.json({
        success: true,
        tags: document.tags,
        message: 'Document already has tags',
      });
      return;
    }

    // Check embedding progress
    const statsResult = await query(
      'SELECT id, embedding FROM document_chunks WHERE document_id = $1',
      [document_id]
    );
    const stats = statsResult.rows;

    const totalChunks = stats.length;
    const chunksWithEmbeddings = stats.filter(
      (chunk: any) => chunk.embedding !== null
    ).length;
    const progress = totalChunks > 0 ? (chunksWithEmbeddings / totalChunks) * 100 : 0;

    console.log(
      `Embedding progress: ${progress.toFixed(1)}% (${chunksWithEmbeddings}/${totalChunks})`
    );

    if (progress < 60) {
      res.json({
        success: false,
        message: `Embedding progress is ${progress.toFixed(1)}%. Tags will be generated at 60% completion.`,
        progress,
      });
      return;
    }

    // Get sample chunks for tag generation
    const sampleResult = await query(
      `SELECT chunk_text FROM document_chunks
       WHERE document_id = $1 AND embedding IS NOT NULL
       ORDER BY chunk_index ASC
       LIMIT 10`,
      [document_id]
    );
    const sampleChunks = sampleResult.rows;

    if (!sampleChunks || sampleChunks.length === 0) {
      res.status(400).json({ error: 'No chunks with embeddings found' });
      return;
    }

    const sampleText = sampleChunks.map((c: any) => c.chunk_text).join('\n\n');

    // Call vLLM Chat API
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
            content:
              'You are an expert at analyzing legal and financial documents. Generate exactly 5 relevant tags that describe the document\'s content, purpose, and key topics. Tags should be short (1-3 words), specific, and useful for categorization. Return only a JSON array of 5 strings.',
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
      throw new Error(`vLLM Chat API error: ${chatResponse.status} - ${errorText}`);
    }

    const chatData = (await chatResponse.json()) as any;
    const responseText = chatData.choices[0]?.message?.content?.trim() || '[]';
    console.log('vLLM response:', responseText);

    // Parse tags from AI response
    let tags: string[] = [];
    try {
      tags = JSON.parse(responseText);
      if (!Array.isArray(tags)) {
        throw new Error('Response is not an array');
      }
      tags = tags.slice(0, 5);
    } catch {
      // Fallback: extract quoted strings
      const matches = responseText.match(/"([^"]+)"/g);
      if (matches && matches.length > 0) {
        tags = matches.slice(0, 5).map((m: string) => m.replace(/"/g, ''));
      } else {
        // Last resort: category-based defaults
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

    // Save tags to database
    await query('UPDATE documents SET tags = $1 WHERE id = $2', [
      JSON.stringify(tags),
      document_id,
    ]);

    console.log('Tags generated and saved:', tags);

    res.json({
      success: true,
      tags,
      progress: progress.toFixed(1),
    });
  } catch (error) {
    console.error('Tag generation error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /generate-embeddings
 *
 * Generate embeddings for document chunks that don't have them yet.
 * Supports document-specific processing (via document_id) or global
 * processing. Processes in batches with a time budget.
 *
 * Body: { document_id?: string, limit?: number, continue_processing?: boolean }
 */
router.post('/generate-embeddings', async (req: Request, res: Response): Promise<void> => {
  try {
    const startTime = Date.now();
    const TIME_BUDGET_MS = 120_000; // 120 seconds
    const BATCH_SIZE = 3;

    let document_id: string | undefined;
    let continue_processing = false;

    try {
      document_id = req.body.document_id;
      continue_processing = req.body.continue_processing || false;
    } catch {
      // No body or invalid JSON, use defaults
    }

    console.log('Starting embedding generation...');

    let totalUpdated = 0;
    let totalProcessed = 0;
    const allErrors: Array<{ chunkId: string; error: string }> = [];
    let tagTriggered = false;

    // Process chunks in a loop until done or time budget exceeded
    while (true) {
      if (Date.now() - startTime > TIME_BUDGET_MS) {
        console.log('Time budget exceeded, stopping');
        break;
      }

      // Fetch next batch of chunks without embeddings
      let fetchQuery: string;
      let fetchParams: any[];

      if (document_id) {
        fetchQuery = `SELECT id, chunk_text, chunk_index, document_id
          FROM document_chunks
          WHERE embedding IS NULL
            AND chunk_text != ''
            AND chunk_text IS NOT NULL
            AND document_id = $1
          ORDER BY created_at ASC
          LIMIT $2`;
        fetchParams = [document_id, BATCH_SIZE];
      } else {
        fetchQuery = `SELECT id, chunk_text, chunk_index, document_id
          FROM document_chunks
          WHERE embedding IS NULL
            AND chunk_text != ''
            AND chunk_text IS NOT NULL
          ORDER BY created_at ASC
          LIMIT $1`;
        fetchParams = [BATCH_SIZE];
      }

      const chunkResult = await query(fetchQuery, fetchParams);
      const chunks = chunkResult.rows;

      if (!chunks || chunks.length === 0) {
        console.log('No more chunks need embedding generation');
        break;
      }

      console.log(`Processing batch of ${chunks.length} chunks...`);

      for (const chunk of chunks) {
        if (Date.now() - startTime > TIME_BUDGET_MS) {
          console.log('Time budget exceeded mid-batch');
          break;
        }

        try {
          const embedding = await generateVLLMEmbedding(chunk.chunk_text);

          if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
            throw new Error(
              `Invalid embedding: ${embedding ? `length=${embedding.length}` : 'null'}`
            );
          }

          await query('UPDATE document_chunks SET embedding = $1 WHERE id = $2', [
            JSON.stringify(embedding),
            chunk.id,
          ]);

          totalUpdated++;
          console.log(`Chunk ${chunk.chunk_index} done (${totalUpdated} total)`);
        } catch (err: any) {
          console.error(`Error chunk ${chunk.id}:`, err.message);
          allErrors.push({ chunkId: chunk.id, error: err.message });
        }
        totalProcessed++;
      }

      // After each batch, check tag generation for document-specific processing
      if (document_id && totalUpdated > 0 && !tagTriggered) {
        try {
          const totalResult = await query(
            'SELECT COUNT(*)::int AS count FROM document_chunks WHERE document_id = $1',
            [document_id]
          );
          const embeddedResult = await query(
            'SELECT COUNT(*)::int AS count FROM document_chunks WHERE document_id = $1 AND embedding IS NOT NULL',
            [document_id]
          );

          const totalChunks = totalResult.rows[0]?.count || 0;
          const embeddedChunks = embeddedResult.rows[0]?.count || 0;

          if (totalChunks > 0) {
            const progress = (embeddedChunks / totalChunks) * 100;
            console.log(
              `Progress: ${progress.toFixed(1)}% (${embeddedChunks}/${totalChunks})`
            );

            if (progress >= 60) {
              const docDataResult = await query(
                'SELECT tags, tag_generation_triggered FROM documents WHERE id = $1',
                [document_id]
              );
              const docData = docDataResult.rows[0];

              const hasTags =
                docData?.tags && Array.isArray(docData.tags) && docData.tags.length > 0;
              const alreadyTriggered = docData?.tag_generation_triggered === true;

              if (!hasTags && (!alreadyTriggered || progress >= 100)) {
                console.log(`Triggering tag generation at ${progress.toFixed(1)}%`);

                await query(
                  'UPDATE documents SET tag_generation_triggered = true WHERE id = $1',
                  [document_id]
                );

                // Trigger tag generation locally (non-blocking)
                generateTagsForDocument(document_id).catch((tagErr) => {
                  console.error('Failed to trigger tag generation:', tagErr);
                });

                tagTriggered = true;
              }
            }
          }
        } catch (progressError: any) {
          console.error('Progress check error:', progressError.message);
        }
      }

      // If not continue_processing, stop after first batch
      if (!continue_processing) {
        break;
      }
    }

    // Final remaining count
    let remainingQuery: string;
    let remainingParams: any[];

    if (document_id) {
      remainingQuery = `SELECT COUNT(*)::int AS count
        FROM document_chunks
        WHERE embedding IS NULL
          AND chunk_text != ''
          AND chunk_text IS NOT NULL
          AND document_id = $1`;
      remainingParams = [document_id];
    } else {
      remainingQuery = `SELECT COUNT(*)::int AS count
        FROM document_chunks
        WHERE embedding IS NULL
          AND chunk_text != ''
          AND chunk_text IS NOT NULL`;
      remainingParams = [];
    }

    const remainingResult = await query(remainingQuery, remainingParams);
    const remainingCount = remainingResult.rows[0]?.count || 0;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log(
      `Done in ${elapsed}s: ${totalUpdated}/${totalProcessed} updated, ${remainingCount} remaining`
    );

    res.json({
      success: true,
      updated: totalUpdated,
      total: totalProcessed,
      remaining: remainingCount,
      elapsed_seconds: parseFloat(elapsed),
      errors: allErrors.length > 0 ? allErrors : undefined,
    });
  } catch (err: any) {
    console.error('Fatal error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: err.message,
    });
  }
});

/**
 * POST /process-null-embeddings
 *
 * Find and fix all chunks with NULL embeddings across all documents.
 * Processes in batches, then checks for documents ready for tag generation.
 * Also covers the scheduled-embedding-processor functionality.
 */
router.post('/process-null-embeddings', async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('Starting automatic NULL embedding processing...');

    // Count chunks with NULL embeddings
    const nullCountResult = await query(
      `SELECT COUNT(*)::int AS count
       FROM document_chunks
       WHERE embedding IS NULL
         AND chunk_text != ''
         AND chunk_text IS NOT NULL`
    );
    const nullCount = nullCountResult.rows[0]?.count || 0;

    if (nullCount === 0) {
      console.log('No chunks with NULL embeddings found');
      res.json({
        success: true,
        message: 'No chunks need processing',
        processed: 0,
        remaining: 0,
      });
      return;
    }

    console.log(`Found ${nullCount} chunks with NULL embeddings`);

    // Process all using the vLLM embeddings service
    const result = await processAllVLLMEmbeddings();

    // Get remaining count after processing
    const remainingResult = await query(
      `SELECT COUNT(*)::int AS count
       FROM document_chunks
       WHERE embedding IS NULL
         AND chunk_text != ''
         AND chunk_text IS NOT NULL`
    );
    const remainingCount = remainingResult.rows[0]?.count || 0;

    console.log(
      `Processing complete: ${result.processed} chunks processed, ${remainingCount} remaining`
    );

    // Check for documents ready for tag generation
    console.log('Checking for documents ready for tag generation...');

    const docsResult = await query(
      "SELECT id, tags FROM documents WHERE tags IS NULL OR tags = '{}'"
    );
    const documents = docsResult.rows;

    if (documents && documents.length > 0) {
      for (const doc of documents) {
        const statsResult = await query(
          'SELECT id, embedding FROM document_chunks WHERE document_id = $1',
          [doc.id]
        );
        const stats = statsResult.rows;

        if (stats && stats.length > 0) {
          const totalChunks = stats.length;
          const chunksWithEmbeddings = stats.filter(
            (chunk: any) => chunk.embedding !== null
          ).length;
          const progress = (chunksWithEmbeddings / totalChunks) * 100;

          if (progress >= 60 && (!doc.tags || doc.tags.length === 0)) {
            console.log(
              `Document ${doc.id} is ${progress.toFixed(1)}% complete, generating tags...`
            );
            generateTagsForDocument(doc.id).catch((tagError) => {
              console.error(`Failed to generate tags for document ${doc.id}:`, tagError);
            });
          }
        }
      }
    }

    res.json({
      success: true,
      message: 'Automatic embedding processing completed',
      processed: result.processed,
      remaining: remainingCount,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (err: any) {
    console.error('Fatal error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: err.message,
    });
  }
});

// ─── Internal Helper Functions ───────────────────────────────────────────────

/**
 * Process a document in the background: extract text, chunk, store chunks,
 * mark processed, and trigger embedding generation.
 */
async function processDocumentInBackground(documentId: string): Promise<void> {
  try {
    console.log(`Background processing: ${documentId}`);

    const docResult = await query(
      'SELECT id, user_id, name, processed, file_path, type FROM documents WHERE id = $1',
      [documentId]
    );
    const document = docResult.rows[0];

    if (!document || document.processed) {
      return;
    }

    // Download file
    const fileBuffer = await downloadFromStorage(document.file_path);

    // Extract text
    const extractedText = await TextExtractor.extractText(fileBuffer, document.type);

    if (!extractedText || extractedText.trim().length === 0) {
      console.error(`No text extracted for document ${documentId}`);
      return;
    }

    // Chunk
    const textChunks = TextChunker.chunkText(extractedText);

    if (textChunks.length === 0) {
      console.error(`No valid chunks for document ${documentId}`);
      return;
    }

    // Insert chunks
    const values: any[] = [];
    const valueClauses: string[] = [];
    let paramIdx = 1;
    for (let i = 0; i < textChunks.length; i++) {
      valueClauses.push(
        `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4})`
      );
      values.push(document.id, document.user_id, i, textChunks[i], null);
      paramIdx += 5;
    }

    await query(
      `INSERT INTO document_chunks (document_id, user_id, chunk_index, chunk_text, embedding)
       VALUES ${valueClauses.join(', ')}`,
      values
    );

    // Mark processed
    await query('UPDATE documents SET processed = true WHERE id = $1', [document.id]);

    console.log(`Background processing complete for ${documentId}: ${textChunks.length} chunks`);

    // Trigger embedding generation
    processDocumentVLLMEmbeddings(document.id).catch((err) => {
      console.error(`Embedding generation error for ${documentId}:`, err);
    });
  } catch (error) {
    console.error(`Background processing error for ${documentId}:`, error);
  }
}

/**
 * Generate tags for a document by calling the local tag generation logic.
 * This replaces the previous pattern of calling the Supabase Edge Function.
 */
async function generateTagsForDocument(documentId: string): Promise<void> {
  try {
    const { generateDocumentTags } = await import('../services/tagGeneration');
    const result = await generateDocumentTags(documentId);
    if (result && result.tags) {
      console.log(`Tags auto-generated for ${documentId}: ${result.tags.join(', ')}`);
    }
  } catch (error: any) {
    console.error(`Tag generation failed for ${documentId}:`, error.message);
  }
}

export default router;
