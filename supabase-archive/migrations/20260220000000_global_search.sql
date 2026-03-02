-- ============================================================================
-- Global Search Feature (Pro-only)
--
-- Adds hybrid search (full-text + semantic) across all user documents.
--
-- 1. Add tsvector column + GIN index to document_chunks
-- 2. Auto-populate trigger on INSERT/UPDATE
-- 3. Backfill existing chunks
-- 4. Create global_search_chunks() RPC function
-- 5. Add 'global_search' to feature_flags via set_subscription_defaults()
-- ============================================================================

-- ============================================================================
-- 1. Add tsvector column for full-text search
-- ============================================================================

ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS chunk_text_search tsvector;

-- ============================================================================
-- 2. GIN index for fast full-text search (scoped by user_id)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_chunks_fts
  ON document_chunks USING gin (chunk_text_search);

-- Composite index for user-scoped vector search (used by global_search_chunks)
CREATE INDEX IF NOT EXISTS idx_chunks_user_embedding
  ON document_chunks (user_id)
  WHERE embedding IS NOT NULL;

-- ============================================================================
-- 3. Auto-populate trigger: keeps tsvector in sync with chunk_text
-- ============================================================================

CREATE OR REPLACE FUNCTION update_chunk_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW.chunk_text_search := to_tsvector('english', COALESCE(NEW.chunk_text, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chunk_search_vector_update ON document_chunks;
CREATE TRIGGER chunk_search_vector_update
  BEFORE INSERT OR UPDATE OF chunk_text ON document_chunks
  FOR EACH ROW
  EXECUTE FUNCTION update_chunk_search_vector();

-- ============================================================================
-- 4. Backfill existing chunks (may take a moment on large tables)
-- ============================================================================

UPDATE document_chunks
SET chunk_text_search = to_tsvector('english', COALESCE(chunk_text, ''))
WHERE chunk_text_search IS NULL;

-- ============================================================================
-- 5. Global search RPC function — hybrid FTS + semantic with RRF ranking
--
--    Accepts a raw text query + its embedding.
--    Returns chunks ranked by Reciprocal Rank Fusion of FTS rank and
--    cosine similarity, grouped/joined with parent document metadata.
-- ============================================================================

CREATE OR REPLACE FUNCTION global_search_chunks(
  search_query text,
  query_embedding vector(4096),
  search_user_id uuid,
  filter_category text DEFAULT NULL,
  filter_tags text[] DEFAULT NULL,
  match_count int DEFAULT 20,
  similarity_threshold float DEFAULT 0.25
)
RETURNS TABLE (
  chunk_id uuid,
  document_id uuid,
  document_name text,
  document_category text,
  document_tags text[],
  chunk_index int,
  chunk_text text,
  semantic_score float,
  fts_rank float,
  combined_score float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k_rrf CONSTANT float := 60.0;  -- RRF constant
  ts_query tsquery;
BEGIN
  -- Build the full-text query; fall back to empty if input is blank
  IF TRIM(search_query) = '' THEN
    ts_query := ''::tsquery;
  ELSE
    ts_query := plainto_tsquery('english', search_query);
  END IF;

  RETURN QUERY
  WITH
  -- Semantic results (top N * 2 to leave room for merging)
  semantic AS (
    SELECT
      dc.id AS sid,
      dc.document_id AS sdoc_id,
      dc.chunk_index AS sidx,
      dc.chunk_text AS stext,
      (1 - (dc.embedding <=> query_embedding))::float AS sem_score,
      ROW_NUMBER() OVER (ORDER BY dc.embedding <=> query_embedding) AS sem_rank
    FROM document_chunks dc
    JOIN documents d ON d.id = dc.document_id
    WHERE
      dc.user_id = search_user_id
      AND dc.embedding IS NOT NULL
      AND (1 - (dc.embedding <=> query_embedding)) >= similarity_threshold
      AND (filter_category IS NULL OR d.category = filter_category)
      AND (filter_tags IS NULL OR d.tags && filter_tags)
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count * 2
  ),

  -- Full-text results
  fts AS (
    SELECT
      dc.id AS fid,
      dc.document_id AS fdoc_id,
      dc.chunk_index AS fidx,
      dc.chunk_text AS ftext,
      ts_rank_cd(dc.chunk_text_search, ts_query)::float AS fts_score,
      ROW_NUMBER() OVER (ORDER BY ts_rank_cd(dc.chunk_text_search, ts_query) DESC) AS fts_rank
    FROM document_chunks dc
    JOIN documents d ON d.id = dc.document_id
    WHERE
      dc.user_id = search_user_id
      AND ts_query != ''::tsquery
      AND dc.chunk_text_search @@ ts_query
      AND (filter_category IS NULL OR d.category = filter_category)
      AND (filter_tags IS NULL OR d.tags && filter_tags)
    ORDER BY ts_rank_cd(dc.chunk_text_search, ts_query) DESC
    LIMIT match_count * 2
  ),

  -- Merge via RRF (Reciprocal Rank Fusion)
  merged AS (
    SELECT
      COALESCE(s.sid, f.fid) AS m_chunk_id,
      COALESCE(s.sdoc_id, f.fdoc_id) AS m_doc_id,
      COALESCE(s.sidx, f.fidx) AS m_idx,
      COALESCE(s.stext, f.ftext) AS m_text,
      COALESCE(s.sem_score, 0)::float AS m_sem_score,
      COALESCE(f.fts_score, 0)::float AS m_fts_score,
      (
        COALESCE(1.0 / (k_rrf + s.sem_rank), 0) +
        COALESCE(1.0 / (k_rrf + f.fts_rank), 0)
      )::float AS m_combined
    FROM semantic s
    FULL OUTER JOIN fts f ON s.sid = f.fid
  )

  SELECT
    m.m_chunk_id,
    m.m_doc_id,
    d.name,
    d.category,
    d.tags,
    m.m_idx,
    m.m_text,
    m.m_sem_score,
    m.m_fts_score,
    m.m_combined
  FROM merged m
  JOIN documents d ON d.id = m.m_doc_id
  ORDER BY m.m_combined DESC
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- 6. Update set_subscription_defaults() to include 'global_search' flag
--
--    CRITICAL: must keep EXCEPTION WHEN OTHERS block so auth.users INSERT
--    is never rolled back.
-- ============================================================================

CREATE OR REPLACE FUNCTION set_subscription_defaults()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.plan = 'free' THEN
    NEW.feature_flags = jsonb_build_object(
      'url_ingestion', false,
      'ocr_enabled', false,
      'auto_tags', false,
      'background_embedding', false,
      'priority_queue', 0,
      'email_notifications', false,
      'multi_device_sync', false,
      'priority_support', false,
      'global_search', false
    );
    NEW.document_limit = 3;
    NEW.ai_questions_limit = 5;
    NEW.monthly_upload_limit = 3;
  ELSIF NEW.plan = 'starter' THEN
    NEW.feature_flags = jsonb_build_object(
      'url_ingestion', true,
      'ocr_enabled', true,
      'auto_tags', true,
      'background_embedding', true,
      'priority_queue', 1,
      'email_notifications', true,
      'multi_device_sync', false,
      'priority_support', false,
      'global_search', false
    );
    NEW.document_limit = 25;
    NEW.ai_questions_limit = 999999;
    NEW.monthly_upload_limit = 30;
  ELSIF NEW.plan = 'pro' THEN
    NEW.feature_flags = jsonb_build_object(
      'url_ingestion', true,
      'ocr_enabled', true,
      'auto_tags', true,
      'background_embedding', true,
      'priority_queue', 2,
      'email_notifications', true,
      'multi_device_sync', true,
      'priority_support', true,
      'global_search', true
    );
    NEW.document_limit = 100;
    NEW.ai_questions_limit = 999999;
    NEW.monthly_upload_limit = 150;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'set_subscription_defaults failed for plan %: %', NEW.plan, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. Backfill global_search flag for existing Pro users
-- ============================================================================

UPDATE user_subscriptions
SET feature_flags = feature_flags || '{"global_search": true}'::jsonb
WHERE plan = 'pro'
  AND NOT (feature_flags ? 'global_search');

UPDATE user_subscriptions
SET feature_flags = feature_flags || '{"global_search": false}'::jsonb
WHERE plan IN ('free', 'starter')
  AND NOT (feature_flags ? 'global_search');
