/*
  # Storage Policies for Document Management

  1. Storage Policies
    - Allow authenticated users to upload to documents bucket
    - Allow authenticated users to read their own documents
    - Allow authenticated users to delete their own documents

  2. Database Functions
    - Add function to match document chunks using vector similarity
    - Enable semantic search across user's documents

  3. Security
    - All policies restrict access to user's own documents only
    - Storage operations are scoped by user ID in file paths
*/

-- Enable RLS on storage.objects if not already enabled
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to upload documents
CREATE POLICY "Allow authenticated uploads to documents bucket"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Policy for authenticated users to read their own documents
CREATE POLICY "Allow authenticated users to read own documents"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Policy for authenticated users to delete their own documents
CREATE POLICY "Allow authenticated users to delete own documents"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'documents' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Function to match document chunks using vector similarity
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  user_id uuid
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  chunk_text text,
  similarity float,
  document_name text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.chunk_text,
    1 - (dc.embedding <=> query_embedding) AS similarity,
    d.name AS document_name
  FROM document_chunks dc
  JOIN documents d ON dc.document_id = d.id
  WHERE 
    dc.user_id = match_document_chunks.user_id
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;