/*
  # Create vector similarity search function for document chunks

  1. New Functions
    - `match_document_chunks`: Performs cosine similarity search on document chunks
      - Accepts query embedding, document_id filter, result count, and similarity threshold
      - Returns matching chunks ordered by similarity score
      - Uses pgvector's cosine distance operator for efficient similarity search

  2. Purpose
    - Enable semantic search within specific documents
    - Support AI-powered chat by finding relevant context
    - Optimize query performance with proper indexing
*/

-- Create function to search for similar document chunks
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector(384),
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

-- Create an index on embeddings for faster similarity search
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx 
ON document_chunks 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Create a composite index for document_id + embedding searches
CREATE INDEX IF NOT EXISTS document_chunks_document_embedding_idx 
ON document_chunks (document_id)
WHERE embedding IS NOT NULL;
