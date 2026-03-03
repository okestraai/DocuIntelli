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
} from '../middleware/subscriptionGuard';

const router = Router();

// ── Environment ──────────────────────────────────────────────────────────────

const vllmChatUrl = process.env.VLLM_CHAT_URL || 'https://chat.affinityecho.com';
const vllmEmbedderUrl = process.env.VLLM_EMBEDDER_URL || 'https://embedder.affinityecho.com';
const cfAccessClientId = process.env.CF_ACCESS_CLIENT_ID!;
const cfAccessClientSecret = process.env.CF_ACCESS_CLIENT_SECRET!;
const chatModel = 'hugging-quants/Meta-Llama-3.1-8B-Instruct-AWQ-INT4';
const embeddingModel = 'intfloat/e5-mistral-7b-instruct';

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
  checkAIQuestionLimit,
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

      if (!cfAccessClientId || !cfAccessClientSecret) {
        res.status(500).json({ success: false, error: 'Cloudflare Access credentials not configured' });
        return;
      }

      // ── Await pre-fired embedding + DB queries in parallel ──
      // embeddingPreflight already started the fetch before auth middleware ran,
      // so the embedding has been in-flight the whole time. Just await the result.
      const embeddingPromise: Promise<globalThis.Response> =
        (req as any)._embeddingPromise ||
        // Fallback: start fresh if pre-flight didn't fire (should not happen for valid requests)
        (() => {
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
        })();

      const [embeddingResponse, docResult, historyResult] = await Promise.all([
        embeddingPromise,
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

      // ── Process embedding response ───────────────────────────────────
      if (!embeddingResponse.ok) {
        const errorText = await embeddingResponse.text();
        throw new Error(`vLLM Embedding API error: ${embeddingResponse.status} - ${errorText}`);
      }

      const embeddingData = await embeddingResponse.json() as any;
      const questionEmbedding: number[] = embeddingData.data[0].embedding;

      if (!questionEmbedding || !Array.isArray(questionEmbedding)) {
        throw new Error('Failed to generate question embedding');
      }

      console.log(`[Chat] Question embedding generated: ${questionEmbedding.length} dimensions`);

      // ── Vector similarity search (direct SQL with pgvector) ──────────
      const embeddingStr = JSON.stringify(questionEmbedding);

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
        [embeddingStr, document_id, 0.3, 4]
      );

      const relevantChunks = searchResult.rows || [];
      console.log(`[Chat] Found ${relevantChunks.length} relevant chunks`);

      // Build context from relevant chunks -- cap each to reduce prompt size
      const MAX_CHUNK_CHARS = 600;
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
      const systemMessage = `You are a concise document assistant. Answer using ONLY the provided document sections. Be brief and direct.
Rules: Only state facts from the sections provided by the user. If not found, say so. Never mention sources. Use conversation history for follow-up context.`;

      const contextMessage = context
        ? `[Document sections]\n${context}\n[End sections]`
        : `No relevant sections were found in this document.`;

      const messages = [
        { role: 'system', content: systemMessage },
        ...conversation_history,
        { role: 'user', content: `${contextMessage}\n\nQuestion: ${question}` },
      ];

      // ── SSE streaming chat response ──────────────────────────────────
      console.log(`[Chat] Calling vLLM Chat (streaming)...`);

      const chatResponse = await fetch(`${vllmChatUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Access-Client-Id': cfAccessClientId,
          'CF-Access-Client-Secret': cfAccessClientSecret,
        },
        body: JSON.stringify({
          model: chatModel,
          messages,
          temperature: 0.4,
          max_tokens: 400,
          stream: true,
        }),
      });

      if (!chatResponse.ok) {
        const errorData = await chatResponse.text();
        throw new Error(`vLLM Chat API error: ${chatResponse.status} - ${errorData}`);
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
