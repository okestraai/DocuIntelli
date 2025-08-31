/*
  # Vector Search Function for Document Chunks

  1. Database Function
    - `match_document_chunks()` for semantic search
    - Uses vector similarity with cosine distance
    - Returns relevant chunks with similarity scores

  2. Security
    - Respects RLS policies on document_chunks table
    - User-scoped search results
    - Configurable similarity threshold

  3. Performance
    - Uses vector indexes for fast search
    - Limits results for optimal response times
*/

-- Create function to search document chunks by similarity
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5,
  user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  chunk_text text,
  document_name text,
  similarity float,
  document_id uuid
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.chunk_text,
    d.name as document_name,
    1 - (dc.embedding <=> query_embedding) as similarity,
    dc.document_id
  FROM document_chunks dc
  JOIN documents d ON dc.document_id = d.id
  WHERE 
    dc.user_id = COALESCE(match_document_chunks.user_id, auth.uid()) AND
    1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION match_document_chunks TO authenticated;
GRANT EXECUTE ON FUNCTION match_document_chunks TO anon;