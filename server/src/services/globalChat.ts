/**
 * Global Chat Service
 *
 * Cross-document AI chat with SSE streaming.
 * Supports @-mention to scope queries to a specific document.
 */

import { Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { generateQueryEmbedding } from './vllmEmbeddings';
import { cacheGet, cacheSet } from './redisClient';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const EMBEDDING_CACHE_TTL = 60; // 1 minute — avoids re-embedding identical follow-ups

const vllmChatUrl = process.env.VLLM_CHAT_URL || 'https://chat.affinityecho.com';
const cfAccessClientId = process.env.CF_ACCESS_CLIENT_ID!;
const cfAccessClientSecret = process.env.CF_ACCESS_CLIENT_SECRET!;
const chatModel = 'hugging-quants/Meta-Llama-3.1-8B-Instruct-AWQ-INT4';

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
async function getCachedQueryEmbedding(query: string): Promise<number[]> {
  const normalised = query.toLowerCase().trim();
  const cacheKey = `qemb:${simpleHash(normalised)}`;

  // Try cache first
  const cached = await cacheGet<number[]>(cacheKey);
  if (cached && Array.isArray(cached) && cached.length > 0) {
    return cached;
  }

  const embedding = await generateQueryEmbedding(query);

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
  query: string,
  mentionedDoc?: DocRef | null
): Promise<{ chunks: RetrievedChunk[]; sources: ChatSource[] }> {
  const embStart = Date.now();
  let queryEmbedding: number[];
  try {
    queryEmbedding = await getCachedQueryEmbedding(query);
  } catch (err) {
    console.error('Global chat: embedding generation failed:', err);
    return { chunks: [], sources: [] };
  }
  console.log(`[GlobalChat] embedding generated in ${Date.now() - embStart}ms, dims=${queryEmbedding.length}`);

  let chunks: RetrievedChunk[] = [];

  if (mentionedDoc) {
    // Single-document search via existing match_document_chunks
    const { data, error } = await supabase.rpc('match_document_chunks', {
      query_embedding: queryEmbedding,
      match_document_id: mentionedDoc.id,
      match_count: 6,
      similarity_threshold: 0.15,
    });

    if (error) {
      console.error('[GlobalChat] match_document_chunks error:', error);
    } else if (data) {
      console.log(`[GlobalChat] match_document_chunks returned ${data.length} rows`);
      chunks = data.map((c: any) => ({
        document_id: mentionedDoc.id,
        document_name: mentionedDoc.name,
        chunk_index: c.chunk_index,
        chunk_text: c.chunk_text,
        similarity: c.similarity,
      }));
    }
  } else {
    // Cross-document search via global_search_chunks
    const rpcStart = Date.now();
    const { data, error } = await supabase.rpc('global_search_chunks', {
      search_query: query,
      query_embedding: queryEmbedding,
      search_user_id: userId,
      match_count: 8,
      similarity_threshold: 0.15,
    });

    if (error) {
      console.error('[GlobalChat] global_search_chunks error:', JSON.stringify(error));
    } else if (data) {
      console.log(`[GlobalChat] global_search_chunks returned ${data.length} rows in ${Date.now() - rpcStart}ms`);
      if (data.length > 0) {
        console.log(`[GlobalChat] top result: doc="${data[0].document_name}" sem=${data[0].semantic_score} combined=${data[0].combined_score}`);
      }
      chunks = data.map((c: any) => ({
        document_id: c.document_id,
        document_name: c.document_name,
        chunk_index: c.chunk_index,
        chunk_text: c.chunk_text,
        similarity: c.semantic_score || c.combined_score || 0,
      }));
    } else {
      console.log('[GlobalChat] global_search_chunks returned null data');
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

const SYSTEM_PROMPT_BASE = `You are a document assistant for DocuIntelli. You answer questions using ONLY the document sections below. Source documents are shown separately to the user — never name, cite, or reference documents, sources, chunks, or sections in your response.

RESPONSE RULES:
1. Be authoritative. If the information is in the sections, state it directly. No hedging ("it seems," "it appears," "may vary"). No "I couldn't find" if relevant info exists.
2. Synthesize across sections. When multiple sections cover the same topic for different services, organize by service using bold headers and bullets.
3. Lead with action. Use numbered steps for processes, bullets for options. Minimize prose.
4. Keep it short. 2-4 sentences for simple questions. Bullets/steps for complex ones. Never repeat information.

CONVERSATION CONTEXT:
- Use conversation history to resolve references like "that service," "what about refunds," or "and the other one."
- Never ask a clarifying question you already asked in the conversation.
- If a follow-up is genuinely ambiguous, ask ONE specific question: "Are you asking about [X] or [Y]?"

EDGE CASES:
- Gibberish or unintelligible input: Reply only "I didn't understand that. How can I help with your documents?"
- No relevant info in sections: "I don't have information about that in your documents. Try uploading the relevant document or rephrasing your question."
- Multiple services match: Show all relevant options organized by service on first mention.`;

export function buildChatMessages(
  chunks: RetrievedChunk[],
  question: string,
  conversationHistory: Array<{ role: string; content: string }>
): Array<{ role: string; content: string }> {
  let systemContent: string;

  if (chunks.length > 0) {
    // Trim each chunk to ~800 chars to keep the context window lean and response fast
    const context = chunks
      .map(c => {
        const text = c.chunk_text.length > 800
          ? c.chunk_text.slice(0, 800) + '...'
          : c.chunk_text;
        return `---\n${text}`;
      })
      .join('\n\n');
    systemContent = `${SYSTEM_PROMPT_BASE}\n\nDocument sections:\n${context}`;
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
 * Stream the vLLM chat response to the client via SSE.
 * Returns the full answer text for persistence.
 */
export async function streamChatResponse(
  res: Response,
  messages: Array<{ role: string; content: string }>,
  sources: ChatSource[]
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
    const errorText = await chatResponse.text();
    console.error('vLLM chat error:', chatResponse.status, errorText);
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
    await supabase.from('global_chats').insert([
      {
        user_id: userId,
        role: 'user',
        content: question,
        mentioned_document_id: mentionedDocId || null,
      },
      {
        user_id: userId,
        role: 'assistant',
        content: answer,
        sources: sources.length > 0 ? sources : null,
        mentioned_document_id: mentionedDocId || null,
      },
    ]);
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
  const { data, error } = await supabase
    .from('global_chats')
    .select('role, content')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  // Reverse to get chronological order
  return data.reverse();
}
