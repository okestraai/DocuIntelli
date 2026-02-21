/**
 * Global Search Service
 *
 * Hybrid search (full-text + semantic) across all of a user's documents.
 * Uses the global_search_chunks() Postgres RPC function which combines
 * tsvector FTS with pgvector cosine similarity via Reciprocal Rank Fusion.
 */

import { createClient } from '@supabase/supabase-js';
import { generateQueryEmbedding } from './vllmEmbeddings';
import { cacheGet, cacheSet, cacheDel } from './redisClient';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SEARCH_CACHE_TTL = 120; // 2 minutes

export interface SearchMatch {
  chunk_id: string;
  chunk_index: number;
  chunk_text: string;
  highlight: string;
  combined_score: number;
}

export interface SearchResultGroup {
  document_id: string;
  document_name: string;
  document_category: string;
  document_tags: string[];
  total_matches: number;
  matches: SearchMatch[];
}

export interface GlobalSearchResult {
  results: SearchResultGroup[];
  total_documents: number;
  total_chunks: number;
  query_time_ms: number;
}

/**
 * Highlight matching terms in chunk text by wrapping them in <mark> tags.
 */
function highlightSnippet(text: string, query: string, maxLength = 200): string {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  let snippet = text;

  if (words.length > 0) {
    // Find the best window around the first matching word
    const lowerText = text.toLowerCase();
    let bestStart = 0;

    for (const word of words) {
      const idx = lowerText.indexOf(word);
      if (idx !== -1) {
        bestStart = Math.max(0, idx - 60);
        break;
      }
    }

    const end = Math.min(text.length, bestStart + maxLength);
    snippet = (bestStart > 0 ? '...' : '') + text.slice(bestStart, end) + (end < text.length ? '...' : '');

    // Wrap matching words with <mark>
    for (const word of words) {
      const regex = new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      snippet = snippet.replace(regex, '<mark>$1</mark>');
    }
  } else {
    snippet = text.slice(0, maxLength) + (text.length > maxLength ? '...' : '');
  }

  return snippet;
}

/**
 * Build a deterministic cache key from search params.
 */
function buildCacheKey(userId: string, query: string, category?: string, tags?: string[]): string {
  const parts = [userId, query.toLowerCase().trim()];
  if (category) parts.push(category);
  if (tags && tags.length > 0) parts.push(tags.sort().join(','));
  // Simple hash — good enough for cache keys
  let hash = 0;
  const str = parts.join('|');
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return `gsearch:${userId}:${Math.abs(hash).toString(36)}`;
}

/**
 * Execute a global search across all of a user's documents.
 */
export async function executeGlobalSearch(
  userId: string,
  query: string,
  options: {
    category?: string;
    tags?: string[];
    limit?: number;
  } = {}
): Promise<GlobalSearchResult> {
  const startTime = Date.now();

  // Check cache first
  const cacheKey = buildCacheKey(userId, query, options.category, options.tags);
  const cached = await cacheGet<GlobalSearchResult>(cacheKey);
  if (cached) {
    return { ...cached, query_time_ms: Date.now() - startTime };
  }

  // Generate query embedding for semantic search
  let queryEmbedding: number[];
  try {
    queryEmbedding = await generateQueryEmbedding(query);
  } catch (err) {
    console.error('Global search: embedding generation failed, falling back to FTS-only:', err);
    // Fall back to FTS-only by providing a zero vector
    queryEmbedding = new Array(4096).fill(0);
  }

  // Request a larger batch from the DB so total_matches per document
  // reflects the real count, not just the display cap.
  const DB_MATCH_COUNT = 100;

  // Call the hybrid search RPC function
  const { data: chunks, error } = await supabase.rpc('global_search_chunks', {
    search_query: query,
    query_embedding: queryEmbedding,
    search_user_id: userId,
    filter_category: options.category || null,
    filter_tags: options.tags || null,
    match_count: DB_MATCH_COUNT,
    similarity_threshold: 0.55,
  });

  if (error) {
    console.error('Global search RPC error:', error);
    throw new Error('Search failed. Please try again.');
  }

  // Post-filter: guard against gibberish / nonsensical queries.
  // Embedding models always produce nearest-neighbor results even for random
  // text, so cosine similarity alone is not a reliable relevance signal.
  // Strategy: at least ONE chunk in the result set must have a real full-text
  // match (fts_rank > 0). If no chunk has any FTS word overlap with the query,
  // the query is likely gibberish or completely unrelated — return empty.
  const allChunks = chunks ?? [];
  const hasFtsMatchAnywhere = allChunks.some((c: any) => c.fts_rank > 0);

  if (!hasFtsMatchAnywhere) {
    const emptyResult: GlobalSearchResult = {
      results: [],
      total_documents: 0,
      total_chunks: 0,
      query_time_ms: Date.now() - startTime,
    };
    await cacheSet(cacheKey, emptyResult, SEARCH_CACHE_TTL);
    return emptyResult;
  }

  // Keep chunks that have either FTS match or strong semantic similarity.
  const MIN_SEMANTIC_SCORE = 0.5;
  const relevantChunks = allChunks.filter((c: any) => {
    return c.fts_rank > 0 || c.semantic_score >= MIN_SEMANTIC_SCORE;
  });

  if (relevantChunks.length === 0) {
    const emptyResult: GlobalSearchResult = {
      results: [],
      total_documents: 0,
      total_chunks: 0,
      query_time_ms: Date.now() - startTime,
    };
    await cacheSet(cacheKey, emptyResult, SEARCH_CACHE_TTL);
    return emptyResult;
  }

  // Group chunks by document. Keep all matches counted via total_matches,
  // but only store the top snippets in the matches array for payload size.
  const MAX_SNIPPETS_PER_DOC = 5;
  const groupMap = new Map<string, SearchResultGroup>();

  for (const chunk of relevantChunks) {
    const docId = chunk.document_id;
    if (!groupMap.has(docId)) {
      groupMap.set(docId, {
        document_id: docId,
        document_name: chunk.document_name,
        document_category: chunk.document_category,
        document_tags: chunk.document_tags || [],
        total_matches: 0,
        matches: [],
      });
    }

    const group = groupMap.get(docId)!;
    group.total_matches++;
    if (group.matches.length < MAX_SNIPPETS_PER_DOC) {
      group.matches.push({
        chunk_id: chunk.chunk_id,
        chunk_index: chunk.chunk_index,
        chunk_text: chunk.chunk_text,
        highlight: highlightSnippet(chunk.chunk_text, query),
        combined_score: chunk.combined_score,
      });
    }
  }

  const results = Array.from(groupMap.values());

  const searchResult: GlobalSearchResult = {
    results,
    total_documents: results.length,
    total_chunks: results.reduce((sum, r) => sum + r.total_matches, 0),
    query_time_ms: Date.now() - startTime,
  };

  // Cache the result
  await cacheSet(cacheKey, searchResult, SEARCH_CACHE_TTL);

  return searchResult;
}

/**
 * Invalidate all global search cache entries for a user.
 * Call after document upload, delete, or re-processing.
 */
export async function invalidateSearchCache(userId: string): Promise<void> {
  // Redis doesn't support wildcard delete natively with our helper,
  // so we rely on the TTL (2 min) for cache expiry.
  // For immediate invalidation of the most common key pattern:
  await cacheDel(`gsearch:${userId}:*`);
}
