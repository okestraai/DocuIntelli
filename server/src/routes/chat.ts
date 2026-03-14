/**
 * Document Chat API Route
 *
 * POST /api/chat — Single-document AI chat with SSE streaming
 *
 * Converted from Supabase Edge Function (chat-document) to Express route.
 * Uses direct PostgreSQL queries (pgvector) instead of Supabase RPC,
 * and custom JWT auth instead of Supabase Auth.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { query } from '../services/db';
import { verifyAccessToken } from '../services/authService';
import { detectImpersonation } from '../middleware/impersonation';
import {
  loadSubscription,
  checkAIQuestionLimit,
  checkTokenBudget,
  incrementTokensUsed,
  checkAIChatRateLimit,
} from '../middleware/subscriptionGuard';
import { getLLMConfig, estimateTokens } from '../services/llmRouter';

const router = Router();

// ── Environment ──────────────────────────────────────────────────────────────

const vllmEmbedderUrl = process.env.VLLM_EMBEDDER_URL || 'https://vllm-embedder.docuintelli.com';
const cfAccessClientId = process.env.CF_ACCESS_CLIENT_ID!;
const cfAccessClientSecret = process.env.CF_ACCESS_CLIENT_SECRET!;
const embeddingModel = 'BAAI/bge-m3';

// ── Types ────────────────────────────────────────────────────────────────────

interface ChatSource {
  chunk_index: number;
  similarity: number;
  preview: string;
}

// ── Embedding pre-flight ────────────────────────────────────────────────────
// Fires the embedding request BEFORE auth middleware so they run in parallel.
// req.body is already parsed (global JSON middleware runs before route middleware).
// If middleware later rejects the request, the abandoned promise is silently caught.

function embeddingPreflight(req: Request, _res: Response, next: NextFunction): void {
  const { question, warmup } = req.body || {};

  if (
    !warmup &&
    question &&
    typeof question === 'string' &&
    question.length <= 2000 &&
    cfAccessClientId &&
    cfAccessClientSecret
  ) {
    const questionFormatted = `Instruct: Given a web search query, retrieve relevant passages\nQuery: ${question}`;

    const promise = fetch(`${vllmEmbedderUrl}/v1/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Access-Client-Id': cfAccessClientId,
        'CF-Access-Client-Secret': cfAccessClientSecret,
      },
      body: JSON.stringify({
        model: embeddingModel,
        input: [questionFormatted],
      }),
    });

    // Prevent unhandled rejection if middleware chain rejects the request early
    promise.catch(() => {});

    (req as any)._embeddingPromise = promise;
  }

  next();
}

// ── Route ────────────────────────────────────────────────────────────────────

router.post(
  '/',
  embeddingPreflight,
  loadSubscription,
  detectImpersonation,
  checkAIChatRateLimit,
  checkAIQuestionLimit,
  checkTokenBudget,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({ success: false, error: 'Not authenticated' });
        return;
      }

      const { document_id, question, warmup } = req.body;

      // Warmup ping -- return immediately to keep the route hot
      if (warmup) {
        res.json({ ok: true });
        return;
      }

      // ── Input validation ─────────────────────────────────────────────
      if (!document_id || !question) {
        res.status(400).json({ success: false, error: 'document_id and question are required' });
        return;
      }

      if (typeof question !== 'string' || question.length > 2000) {
        res.status(400).json({ success: false, error: 'Question must be a string of 2000 characters or less' });
        return;
      }

      // ── Await embedding + DB queries in parallel ──
      // embeddingPreflight already started the fetch before auth middleware ran,
      // so the embedding has been in-flight the whole time. Just await the result.
      const embeddingPromise: Promise<globalThis.Response> | null =
        (req as any)._embeddingPromise ||
        (cfAccessClientId && cfAccessClientSecret
          ? (() => {
              const questionFormatted = `Instruct: Given a web search query, retrieve relevant passages\nQuery: ${question}`;
              return fetch(`${vllmEmbedderUrl}/v1/embeddings`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'CF-Access-Client-Id': cfAccessClientId,
                  'CF-Access-Client-Secret': cfAccessClientSecret,
                },
                body: JSON.stringify({
                  model: embeddingModel,
                  input: [questionFormatted],
                }),
              });
            })()
          : null);

      const [embeddingResult, docResult, historyResult] = await Promise.all([
        embeddingPromise
          ? embeddingPromise.then(async (resp) => {
              if (!resp.ok) {
                console.warn(`[Chat] Embedder returned ${resp.status}, will fall back to text search`);
                return null;
              }
              const data = await resp.json() as any;
              return data?.data?.[0]?.embedding as number[] | null;
            }).catch((err) => {
              console.warn(`[Chat] Embedding request failed: ${err.message}, falling back to text search`);
              return null;
            })
          : Promise.resolve(null),
        query(
          `SELECT id FROM documents
           WHERE id = $1 AND user_id = $2`,
          [document_id, userId]
        ),
        query(
          `SELECT role, content FROM document_chats
           WHERE user_id = $1 AND document_id = $2
           ORDER BY created_at ASC
           LIMIT 8`,
          [userId, document_id]
        ),
      ]);

      if (docResult.rows.length === 0) {
        res.status(403).json({ success: false, error: 'Document not found or access denied' });
        return;
      }

      console.log(`[Chat] Processing question for document: ${document_id}`);

      const conversation_history = historyResult.rows || [];
      console.log(`[Chat] Loaded ${conversation_history.length} previous messages`);

      // ── Retrieve relevant chunks (vector search with text fallback) ──
      let relevantChunks: any[];

      if (embeddingResult && Array.isArray(embeddingResult)) {
        // Vector similarity search (preferred path)
        console.log(`[Chat] Question embedding generated: ${embeddingResult.length} dimensions`);
        const embeddingStr = JSON.stringify(embeddingResult);

        const searchResult = await query(
          `SELECT
             dc.chunk_index,
             dc.chunk_text,
             1 - (dc.embedding <=> $1::vector) AS similarity
           FROM document_chunks dc
           WHERE dc.document_id = $2::uuid
             AND dc.embedding IS NOT NULL
             AND 1 - (dc.embedding <=> $1::vector) >= $3
           ORDER BY dc.embedding <=> $1::vector
           LIMIT $4`,
          [embeddingStr, document_id, 0.2, 8]
        );
        relevantChunks = searchResult.rows || [];
      } else {
        // Text-based fallback: keyword search on chunk text
        console.warn('[Chat] Using text-based fallback (embedder unavailable)');
        const keywords = question
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .split(/\s+/)
          .filter((w: string) => w.length > 2);

        const tsQuery = keywords.join(' & ');
        const searchResult = await query(
          `SELECT
             dc.chunk_index,
             dc.chunk_text,
             ts_rank(to_tsvector('english', dc.chunk_text), to_tsquery('english', $1)) AS similarity
           FROM document_chunks dc
           WHERE dc.document_id = $2::uuid
             AND to_tsvector('english', dc.chunk_text) @@ to_tsquery('english', $1)
           ORDER BY similarity DESC
           LIMIT $3`,
          [tsQuery, document_id, 8]
        );
        relevantChunks = searchResult.rows || [];

        // If ts_query found nothing, grab the first N chunks as context
        if (relevantChunks.length === 0) {
          console.warn('[Chat] Text search found no matches, using first chunks as context');
          const fallbackResult = await query(
            `SELECT chunk_index, chunk_text, 0.5 AS similarity
             FROM document_chunks
             WHERE document_id = $1::uuid
             ORDER BY chunk_index ASC
             LIMIT $2`,
            [document_id, 6]
          );
          relevantChunks = fallbackResult.rows || [];
        }
      }

      console.log(`[Chat] Found ${relevantChunks.length} relevant chunks`);

      // Build context from relevant chunks -- cap each to reduce prompt size
      const MAX_CHUNK_CHARS = 1200;
      let context = '';
      if (relevantChunks.length > 0) {
        context = relevantChunks
          .map((chunk: any) => {
            const text: string = chunk.chunk_text;
            return text.length > MAX_CHUNK_CHARS ? text.slice(0, MAX_CHUNK_CHARS) + '...' : text;
          })
          .join('\n---\n');
      }

      const sources: ChatSource[] = relevantChunks.map((chunk: any) => ({
        chunk_index: chunk.chunk_index,
        similarity: chunk.similarity,
        preview: chunk.chunk_text.slice(0, 150) + (chunk.chunk_text.length > 150 ? '...' : ''),
      }));

      console.log(`[Chat] Context built: ${context.length} characters`);

      // ── Build chat messages ──────────────────────────────────────────
      // System message is CONSTANT so vLLM prefix cache always hits (~100%).
      // Variable content (chunks) goes in a user message before the question.
      const systemMessage = `You are a concise document assistant for DocuIntelli. Answer based on the provided document sections. Never name, cite, or reference sources, chunks, or sections.

RESPONSE STYLE:
- Be concise. Answer the question directly in 2-4 sentences for simple questions. Only expand for broad questions ("tell me about this document").
- Lead with the answer, not the context. State the key fact first, then supporting details only if needed.
- Use bullet points sparingly — only when listing 3+ distinct items. Avoid unnecessary headers for short answers.
- State exact figures (dollar amounts, dates, names) but don't pad with every tangential data point.
- Be authoritative. No hedging ("it seems," "it appears"). State facts directly.

REASONING:
- Analyze the data to answer the question — don't just quote text verbatim.
- Distinguish between form templates/instructions and actual filled-in data. Prioritize actual data.
- Infer answers from available data points. Connect related data across sections.

ANTI-HALLUCINATION:
- NEVER invent data not present in the provided sections.
- NEVER use placeholder variables or empty formulas. State real values or say the info is unavailable.
- If you lack information, say so in one sentence.

CONVERSATION CONTEXT:
- Use conversation history to resolve follow-up references.

EDGE CASES:
- Gibberish input: Reply "I didn't understand that. How can I help with your document?"
- No relevant info: "I don't have information about that in this document. Try rephrasing your question."`;

      const contextMessage = context
        ? `[Document sections]\n${context}\n[End sections]`
        : `No relevant sections were found in this document.`;

      const messages = [
        { role: 'system', content: systemMessage },
        ...conversation_history,
        { role: 'user', content: `${contextMessage}\n\nQuestion: ${question}` },
      ];

      // ── SSE streaming chat response ──────────────────────────────────
      const llmConfig = getLLMConfig(req.subscription?.plan || 'free');
      console.log(`[Chat] Calling LLM (${llmConfig.model}) via ${llmConfig.baseUrl} (streaming)...`);

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
        const errorData = await chatResponse.text();
        throw new Error(`LLM Chat API error (${llmConfig.model}): ${chatResponse.status} - ${errorData}`);
      }

      // Set SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      // Pipe vLLM SSE stream to client
      if (!chatResponse.body) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: 'No response stream' })}\n\n`);
        res.end();
        return;
      }

      const reader = (chatResponse.body as any).getReader();
      const decoder = new TextDecoder();
      let fullAnswer = '';
      let buffer = '';
      const isImpersonated = req.isImpersonated || false;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          // Keep the last potentially incomplete line in the buffer
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;

            const data = trimmed.slice(6);
            if (data === '[DONE]') {
              // Send final event with sources and full answer
              res.write(
                `data: ${JSON.stringify({ type: 'done', sources, answer: fullAnswer })}\n\n`
              );

              console.log(`[Chat] Answer streamed: ${fullAnswer.length} characters`);

              // Fire-and-forget parallel DB saves
              // Skip when impersonated -- admin chats should not appear in user history
              if (!isImpersonated) {
                Promise.all([
                  query(
                    `INSERT INTO document_chats (user_id, document_id, role, content)
                     VALUES ($1, $2, $3, $4)`,
                    [userId, document_id, 'user', question]
                  ),
                  query(
                    `INSERT INTO document_chats (user_id, document_id, role, content, sources)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [userId, document_id, 'assistant', fullAnswer, sources.length > 0 ? JSON.stringify(sources) : null]
                  ),
                ]).then(() => {
                  console.log('[Chat] Conversation saved to database');
                }).catch((err) => {
                  console.error('[Chat] Error saving chat messages:', err);
                });

                // Increment AI question counter for free tier (fire-and-forget)
                if (req.subscription?.plan === 'free') {
                  query(
                    `UPDATE user_subscriptions SET ai_questions_used = $1, updated_at = $2 WHERE id = $3`,
                    [(req.subscription.ai_questions_used || 0) + 1, new Date().toISOString(), req.subscription.id]
                  ).catch(() => {});
                }

                // Track token usage (fire-and-forget)
                if (req.subscription) {
                  const promptTokens = estimateTokens(JSON.stringify(messages));
                  const completionTokens = estimateTokens(fullAnswer);
                  incrementTokensUsed(req.subscription.id, promptTokens + completionTokens).catch(() => {});
                }
              } else {
                console.log('[Chat] Impersonation mode -- skipping chat persistence');
              }

              res.end();
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content || '';
              if (content) {
                fullAnswer += content;
                res.write(
                  `data: ${JSON.stringify({ type: 'chunk', content })}\n\n`
                );
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }

        // Stream ended without [DONE] -- still save what we have
        if (fullAnswer) {
          res.write(
            `data: ${JSON.stringify({ type: 'done', sources, answer: fullAnswer })}\n\n`
          );
          if (!isImpersonated) {
            Promise.all([
              query(
                `INSERT INTO document_chats (user_id, document_id, role, content)
                 VALUES ($1, $2, $3, $4)`,
                [userId, document_id, 'user', question]
              ),
              query(
                `INSERT INTO document_chats (user_id, document_id, role, content, sources)
                 VALUES ($1, $2, $3, $4, $5)`,
                [userId, document_id, 'assistant', fullAnswer, sources.length > 0 ? JSON.stringify(sources) : null]
              ),
            ]).catch((err) => console.error('[Chat] Error saving chat messages:', err));
          }
        }
        res.end();
      } catch (streamError: any) {
        console.error('[Chat] Streaming error:', streamError);
        res.write(
          `data: ${JSON.stringify({ type: 'error', error: streamError.message })}\n\n`
        );
        res.end();
      }
    } catch (err: any) {
      console.error('[Chat] Error:', err);
      // Only send JSON error if SSE headers haven't been sent yet
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Internal server error',
          details: err.message,
        });
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', error: 'Unexpected error' })}\n\n`);
        res.end();
      }
    }
  }
);

export default router;
