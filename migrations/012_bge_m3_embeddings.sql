-- Migration 012: Switch embeddings from e5-mistral-7b-instruct (4096 dims) to BGE-M3 (1024 dims)
--
-- BGE-M3 is smaller (~568M vs 7B params), more stable on GPU, and critically
-- 1024 dims is under Azure pgvector's 2000-dim index limit — enabling HNSW indexes.
--
-- All existing embeddings are invalidated (different vector space) and must be re-generated.

-- 1. Drop existing indexes referencing the embedding column
DROP INDEX IF EXISTS document_chunks_document_embedding_idx;

-- 2. NULL out all existing embeddings (incompatible vector space)
UPDATE document_chunks SET embedding = NULL;

-- 3. Alter column type from vector(4096) to vector(1024)
ALTER TABLE document_chunks ALTER COLUMN embedding TYPE vector(1024);

-- 4. Create HNSW index for fast cosine similarity search
--    Previously impossible with 4096 dims (Azure pgvector limit: 2000).
CREATE INDEX document_chunks_embedding_hnsw_idx
  ON document_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 5. Recreate match_document_chunks with vector(1024) parameter
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector(1024),
  match_document_id uuid,
  match_count int DEFAULT 5,
  similarity_threshold float DEFAULT 0.3
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  chunk_index int,
  chunk_text text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.chunk_index,
    dc.chunk_text,
    1 - (dc.embedding <=> query_embedding) as similarity
  FROM document_chunks dc
  WHERE
    dc.document_id = match_document_id
    AND dc.embedding IS NOT NULL
    AND 1 - (dc.embedding <=> query_embedding) >= similarity_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 6. Recreate global_search_chunks with vector(1024) parameter
CREATE OR REPLACE FUNCTION global_search_chunks(
  search_query text,
  query_embedding vector(1024),
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
  k_rrf CONSTANT float := 60.0;
  ts_query tsquery;
BEGIN
  IF TRIM(search_query) = '' THEN
    ts_query := ''::tsquery;
  ELSE
    ts_query := plainto_tsquery('english', search_query);
  END IF;

  RETURN QUERY
  WITH
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
