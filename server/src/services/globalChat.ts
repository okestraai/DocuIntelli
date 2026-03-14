/**
 * Global Chat Service
 *
 * Cross-document AI chat with SSE streaming.
 * Supports @-mention to scope queries to a specific document.
 */

import { Response } from 'express';
import { query } from '../services/db';
import { generateQueryEmbedding } from './vllmEmbeddings';
import { cacheGet, cacheSet } from './redisClient';
import { LLMConfig } from './llmRouter';

const EMBEDDING_CACHE_TTL = 60; // 1 minute — avoids re-embedding identical follow-ups

// ─── Types ───────────────────────────────────────────────────────────

export interface DocRef {
  id: string;
  name: string;
}

export interface ChatSource {
  document_id: string;
  document_name: string;
  chunk_index: number;
  similarity: number;
}

interface RetrievedChunk {
  document_id: string;
  document_name: string;
  chunk_index: number;
  chunk_text: string;
  similarity: number;
}

// ─── @-mention Parsing ───────────────────────────────────────────────

/**
 * Parse an @DocumentName mention from the query.
 * Returns the matched document (if any) and the query with the mention stripped.
 */
export function parseAtMention(
  query: string,
  documents: DocRef[]
): { mentionedDocument: DocRef | null; cleanedQuery: string } {
  const atMatch = query.match(/@(.+?)(?=\s+\S|\s*$)/);
  if (!atMatch) {
    return { mentionedDocument: null, cleanedQuery: query };
  }

  const mentionText = atMatch[1].trim().toLowerCase();

  // Try exact match first, then prefix match, then includes match
  let matched = documents.find(d => d.name.toLowerCase() === mentionText);
  if (!matched) {
    matched = documents.find(d => d.name.toLowerCase().startsWith(mentionText));
  }
  if (!matched) {
    matched = documents.find(d => d.name.toLowerCase().includes(mentionText));
  }

  if (!matched) {
    return { mentionedDocument: null, cleanedQuery: query };
  }

  // Strip the @mention from the query
  const cleanedQuery = query.replace(atMatch[0], '').replace(/\s+/g, ' ').trim();

  return {
    mentionedDocument: matched,
    cleanedQuery: cleanedQuery || query, // fallback to original if stripping leaves nothing
  };
}

// ─── Cached Embedding ───────────────────────────────────────────────

/**
 * Generate a query embedding with short-lived Redis caching.
 * Avoids re-calling the vLLM embedder for identical or very recent queries.
 */
async function getCachedQueryEmbedding(queryText: string): Promise<number[]> {
  const normalised = queryText.toLowerCase().trim();
  const cacheKey = `qemb:${simpleHash(normalised)}`;

  // Try cache first
  const cached = await cacheGet<number[]>(cacheKey);
  if (cached && Array.isArray(cached) && cached.length > 0) {
    return cached;
  }

  const embedding = await generateQueryEmbedding(queryText);

  // Cache for quick follow-ups (fire-and-forget)
  cacheSet(cacheKey, embedding, EMBEDDING_CACHE_TTL).catch(() => {});

  return embedding;
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

// ─── Context Retrieval ───────────────────────────────────────────────

/**
 * Retrieve relevant chunks for the chat context.
 * If mentionedDocId is provided, scopes to that single document.
 * Otherwise, searches across all user documents.
 */
export async function retrieveContext(
  userId: string,
  queryText: string,
  mentionedDoc?: DocRef | null
): Promise<{ chunks: RetrievedChunk[]; sources: ChatSource[] }> {
  const embStart = Date.now();
  let queryEmbedding: number[] | null = null;
  try {
    queryEmbedding = await getCachedQueryEmbedding(queryText);
    console.log(`[GlobalChat] embedding generated in ${Date.now() - embStart}ms, dims=${queryEmbedding.length}`);
  } catch (err) {
    console.warn('[GlobalChat] Embedding generation failed, falling back to text search:', (err as Error).message);
  }

  let chunks: RetrievedChunk[] = [];

  if (queryEmbedding) {
    // ── Vector search path (preferred) ──
    if (mentionedDoc) {
      const embeddingStr = JSON.stringify(queryEmbedding);
      try {
        const result = await query(
          'SELECT * FROM match_document_chunks($1::vector, $2::uuid, $3::int, $4::float)',
          [embeddingStr, mentionedDoc.id, 6, 0.15]
        );

        if (result.rows) {
          console.log(`[GlobalChat] match_document_chunks returned ${result.rows.length} rows`);
          chunks = result.rows.map((c: any) => ({
            document_id: mentionedDoc.id,
            document_name: mentionedDoc.name,
            chunk_index: c.chunk_index,
            chunk_text: c.chunk_text,
            similarity: c.similarity,
          }));
        }
      } catch (error) {
        console.error('[GlobalChat] match_document_chunks error:', error);
      }
    } else {
      const rpcStart = Date.now();
      const embeddingStr = JSON.stringify(queryEmbedding);
      try {
        const result = await query(
          'SELECT * FROM global_search_chunks($1::text, $2::vector, $3::uuid, $4::text, $5::text[], $6::int, $7::float)',
          [queryText, embeddingStr, userId, null, null, 8, 0.15]
        );

        if (result.rows) {
          console.log(`[GlobalChat] global_search_chunks returned ${result.rows.length} rows in ${Date.now() - rpcStart}ms`);
          if (result.rows.length > 0) {
            console.log(`[GlobalChat] top result: doc="${result.rows[0].document_name}" sem=${result.rows[0].semantic_score} combined=${result.rows[0].combined_score}`);
          }
          chunks = result.rows.map((c: any) => ({
            document_id: c.document_id,
            document_name: c.document_name,
            chunk_index: c.chunk_index,
            chunk_text: c.chunk_text,
            similarity: c.semantic_score || c.combined_score || 0,
          }));
        } else {
          console.log('[GlobalChat] global_search_chunks returned no rows');
        }
      } catch (error) {
        console.error('[GlobalChat] global_search_chunks error:', JSON.stringify(error));
      }
    }
  } else {
    // ── Text-based fallback (embedder unavailable) ──
    console.warn('[GlobalChat] Using text-based fallback search');
    const keywords = queryText
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w: string) => w.length > 2);

    if (keywords.length > 0) {
      const tsQuery = keywords.join(' & ');
      try {
        const scopeFilter = mentionedDoc
          ? `AND dc.document_id = '${mentionedDoc.id}'`
          : `AND dc.document_id IN (SELECT id FROM documents WHERE user_id = $2::uuid)`;
        const params = mentionedDoc ? [tsQuery, 8] : [tsQuery, userId, 8];
        const limitParam = mentionedDoc ? '$2' : '$3';

        const result = await query(
          `SELECT dc.chunk_index, dc.chunk_text, d.id AS document_id, d.name AS document_name,
                  ts_rank(to_tsvector('english', dc.chunk_text), to_tsquery('english', $1)) AS similarity
           FROM document_chunks dc
           JOIN documents d ON d.id = dc.document_id
           WHERE to_tsvector('english', dc.chunk_text) @@ to_tsquery('english', $1)
             ${scopeFilter}
           ORDER BY similarity DESC
           LIMIT ${limitParam}`,
          params
        );

        if (result.rows) {
          chunks = result.rows.map((c: any) => ({
            document_id: c.document_id,
            document_name: c.document_name,
            chunk_index: c.chunk_index,
            chunk_text: c.chunk_text,
            similarity: c.similarity,
          }));
          console.log(`[GlobalChat] Text fallback returned ${chunks.length} results`);
        }
      } catch (error) {
        console.error('[GlobalChat] Text fallback search error:', error);
      }
    }
  }

  // Build deduplicated sources
  const sourceMap = new Map<string, ChatSource>();
  for (const chunk of chunks) {
    if (!sourceMap.has(chunk.document_id)) {
      sourceMap.set(chunk.document_id, {
        document_id: chunk.document_id,
        document_name: chunk.document_name,
        chunk_index: chunk.chunk_index,
        similarity: chunk.similarity,
      });
    }
  }

  return { chunks, sources: Array.from(sourceMap.values()) };
}

// ─── Prompt Building ─────────────────────────────────────────────────

const SYSTEM_PROMPT_BASE = `You are a concise document assistant for DocuIntelli. Answer based on the document sections provided below.

DOCUMENT ATTRIBUTION:
- Each section is labeled with [Document: "..."] tags.
- For single-document answers: mention the document name once at the start.
- For multi-document answers: use bold document name headers, then key facts from each.
- If documents conflict, highlight the discrepancy briefly.

RESPONSE STYLE:
- Be concise. Answer directly in 2-4 sentences for simple questions. Only expand for broad questions.
- Lead with the answer. State the key fact first, then supporting details only if needed.
- Use bullet points only when listing 3+ distinct items. Avoid unnecessary headers for short answers.
- State exact figures but don't pad with every tangential data point.
- Be authoritative. No hedging. State facts directly.

REASONING:
- Analyze the data — don't just quote text verbatim.
- Distinguish between form templates and actual filled-in data. Prioritize actual data.
- Infer answers from available data. Connect related data across sections and documents.

ANTI-HALLUCINATION:
- NEVER invent data not present in the provided sections.
- NEVER use placeholder variables or empty formulas. State real values or say the info is unavailable.
- If you lack information, say so in one sentence.

CONVERSATION CONTEXT:
- Use history to resolve follow-up references.
- If genuinely ambiguous, ask ONE specific question.

EDGE CASES:
- Gibberish: "I didn't understand that. How can I help with your documents?"
- No relevant info: "I don't have information about that in your documents. Try uploading the relevant document or rephrasing your question."
- Multiple documents match: Present findings from each under its own header.`;

export function buildChatMessages(
  chunks: RetrievedChunk[],
  question: string,
  conversationHistory: Array<{ role: string; content: string }>,
  allDocuments?: DocRef[]
): Array<{ role: string; content: string }> {
  let systemContent: string;

  if (chunks.length > 0) {
    // Group chunks by document for clearer attribution
    const docChunksMap = new Map<string, { name: string; texts: string[] }>();
    for (const c of chunks) {
      const existing = docChunksMap.get(c.document_id);
      const text = c.chunk_text.length > 1200
        ? c.chunk_text.slice(0, 1200) + '...'
        : c.chunk_text;
      if (existing) {
        existing.texts.push(text);
      } else {
        docChunksMap.set(c.document_id, { name: c.document_name, texts: [text] });
      }
    }

    // Build context with document labels
    const context = Array.from(docChunksMap.values())
      .map(doc => {
        const sections = doc.texts.map(t => t).join('\n\n');
        return `[Document: "${doc.name}"]\n${sections}`;
      })
      .join('\n\n---\n\n');

    // Include a document inventory so the LLM knows what's available
    let inventory = '';
    if (allDocuments && allDocuments.length > 0) {
      const docNames = allDocuments.map(d => d.name).join(', ');
      inventory = `\n\nThe user has ${allDocuments.length} documents in their account: ${docNames}. The most relevant sections are provided below.\n`;
    }

    systemContent = `${SYSTEM_PROMPT_BASE}${inventory}\n\nRelevant document sections:\n\n${context}`;
  } else {
    systemContent = `${SYSTEM_PROMPT_BASE}\n\nNo relevant document sections were found. This may mean the user's documents haven't been fully processed yet, or the question doesn't match any indexed content. Let the user know politely and suggest they verify their documents are processed (check for the green checkmark in the vault).`;
  }

  return [
    { role: 'system', content: systemContent },
    ...conversationHistory.slice(-6), // last 6 messages (3 exchanges) for context
    { role: 'user', content: question },
  ];
}

// ─── SSE Streaming ───────────────────────────────────────────────────

/**
 * Stream an LLM chat response to the client via SSE.
 * Uses the provided LLMConfig to route to the correct provider.
 * Returns the full answer text for persistence.
 */
export async function streamChatResponse(
  res: Response,
  messages: Array<{ role: string; content: string }>,
  sources: ChatSource[],
  llmConfig: LLMConfig
): Promise<string> {
  // Set SSE headers immediately so the client knows we're connected
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // disable nginx buffering
  });

  // Send a "thinking" event so the UI can show immediate feedback
  res.write(`data: ${JSON.stringify({ type: 'thinking' })}\n\n`);

  console.log(`[GlobalChat] Calling LLM (${llmConfig.model}) via ${llmConfig.baseUrl}`);

  const chatResponse = await fetch(`${llmConfig.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: llmConfig.headers,
    body: JSON.stringify({
      model: llmConfig.model,
      messages,
      temperature: 0.4,
      max_tokens: llmConfig.maxTokens,
      frequency_penalty: 0.3,
      stream: true,
      ...llmConfig.extraParams,
    }),
  });

  if (!chatResponse.ok) {
    const errorText = await chatResponse.text();
    console.error(`LLM chat error (${llmConfig.model}):`, chatResponse.status, errorText);
    res.write(`data: ${JSON.stringify({ type: 'error', error: 'AI service unavailable' })}\n\n`);
    res.end();
    return '';
  }

  if (!chatResponse.body) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: 'No response stream' })}\n\n`);
    res.end();
    return '';
  }

  const reader = (chatResponse.body as any).getReader();
  const decoder = new TextDecoder();
  let fullAnswer = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') {
          // Send final event with sources and full answer
          res.write(`data: ${JSON.stringify({ type: 'done', sources, answer: fullAnswer })}\n\n`);
          res.end();
          return fullAnswer;
        }

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content || '';
          if (content) {
            fullAnswer += content;
            res.write(`data: ${JSON.stringify({ type: 'chunk', content })}\n\n`);
          }
        } catch {
          // Skip malformed lines
        }
      }
    }

    // Stream ended without [DONE] — send what we have
    if (fullAnswer) {
      res.write(`data: ${JSON.stringify({ type: 'done', sources, answer: fullAnswer })}\n\n`);
    }
    res.end();
    return fullAnswer;
  } catch (err) {
    console.error('SSE streaming error:', err);
    res.write(`data: ${JSON.stringify({ type: 'error', error: 'Streaming failed' })}\n\n`);
    res.end();
    return fullAnswer;
  }
}

// ─── Persistence ─────────────────────────────────────────────────────

/**
 * Save chat messages to global_chats (fire-and-forget).
 */
export async function persistChatMessages(
  userId: string,
  question: string,
  answer: string,
  sources: ChatSource[],
  mentionedDocId?: string
): Promise<void> {
  try {
    // Insert user message
    await query(
      `INSERT INTO global_chats (user_id, role, content, mentioned_document_id)
       VALUES ($1, $2, $3, $4)`,
      [userId, 'user', question, mentionedDocId || null]
    );
    // Insert assistant message with sources
    await query(
      `INSERT INTO global_chats (user_id, role, content, sources, mentioned_document_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, 'assistant', answer, sources.length > 0 ? JSON.stringify(sources) : null, mentionedDocId || null]
    );
  } catch (err) {
    console.error('Error persisting global chat:', err);
    // Non-blocking — don't throw
  }
}

/**
 * Load recent conversation history for a user.
 */
export async function loadConversationHistory(
  userId: string,
  limit = 10
): Promise<Array<{ role: string; content: string }>> {
  const result = await query(
    'SELECT role, content FROM global_chats WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
    [userId, limit]
  );

  if (!result.rows || result.rows.length === 0) return [];

  // Reverse to get chronological order
  return result.rows.reverse();
}
