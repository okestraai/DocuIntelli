/*
  # Create document_chunks table for vector embeddings

  1. New Tables
    - `document_chunks`
      - `id` (uuid, primary key)
      - `document_id` (uuid, foreign key to documents table)
      - `user_id` (uuid, foreign key to auth.users)
      - `chunk_text` (text, the actual text content)
      - `embedding` (vector, for similarity search)
      - `chunk_index` (integer, order of chunk in document)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `document_chunks` table
    - Add policies for authenticated users to manage their own chunks

  3. Functions
    - Add similarity search function using pgvector
*/

-- Enable the pgvector extension for vector operations
CREATE EXTENSION IF NOT EXISTS vector;

-- Create document_chunks table
CREATE TABLE IF NOT EXISTS document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chunk_text text NOT NULL,
  embedding vector(1536), -- OpenAI ada-002 produces 1536-dimensional vectors
  chunk_index integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_user_id ON document_chunks(user_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON document_chunks USING ivfflat (embedding vector_cosine_ops);

-- Enable Row Level Security
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own document chunks"
  ON document_chunks
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own document chunks"
  ON document_chunks
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own document chunks"
  ON document_chunks
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own document chunks"
  ON document_chunks
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create function for similarity search
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5,
  user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  chunk_text text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    document_chunks.id,
    document_chunks.document_id,
    document_chunks.chunk_text,
    1 - (document_chunks.embedding <=> query_embedding) AS similarity
  FROM document_chunks
  WHERE 
    (user_id IS NULL OR document_chunks.user_id = match_document_chunks.user_id)
    AND 1 - (document_chunks.embedding <=> query_embedding) > match_threshold
  ORDER BY document_chunks.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON document_chunks TO authenticated;
GRANT EXECUTE ON FUNCTION match_document_chunks TO authenticated;