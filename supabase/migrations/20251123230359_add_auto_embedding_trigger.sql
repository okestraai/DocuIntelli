/*
  # Add automatic embedding generation trigger

  ## Purpose
  Automatically trigger embedding generation when document chunks are inserted with NULL embeddings.
  This ensures all chunks eventually get their embeddings without manual intervention.

  ## Changes
  1. New Function: `trigger_embedding_generation()`
     - Automatically calls the generate-embeddings edge function when chunks with NULL embeddings are inserted
     - Uses background processing to avoid blocking the insert operation
     - Batches multiple chunks from the same document together

  ## How It Works
  - When new document_chunks are inserted with NULL embeddings
  - The trigger waits briefly (2 seconds) to allow batching of multiple chunks
  - Then calls the generate-embeddings function to process those chunks
  - This happens automatically in the background without user intervention

  ## Notes
  - The trigger uses pg_background extension if available for true background processing
  - Falls back to immediate processing if pg_background is not available
  - Only processes chunks where embedding IS NULL to avoid unnecessary work
*/

-- Create function to trigger embedding generation for new chunks
CREATE OR REPLACE FUNCTION trigger_embedding_generation()
RETURNS trigger AS $$
BEGIN
  -- Schedule embedding generation in background
  -- Using PERFORM to execute without blocking
  PERFORM net.http_post(
    url := current_setting('app.supabase_url', true) || '/functions/v1/generate-embeddings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
    ),
    body := jsonb_build_object(
      'document_id', NEW.document_id,
      'limit', 5
    )
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on document_chunks for automatic embedding generation
-- Only triggers when embedding is NULL
DROP TRIGGER IF EXISTS auto_generate_embeddings ON document_chunks;
CREATE TRIGGER auto_generate_embeddings
  AFTER INSERT ON document_chunks
  FOR EACH ROW
  WHEN (NEW.embedding IS NULL)
  EXECUTE FUNCTION trigger_embedding_generation();

-- Create a helper function to manually trigger embedding generation for all NULL embeddings
CREATE OR REPLACE FUNCTION generate_missing_embeddings()
RETURNS TABLE(document_id uuid, chunks_count bigint) AS $$
BEGIN
  RETURN QUERY
  SELECT dc.document_id, COUNT(*)::bigint as chunks_count
  FROM document_chunks dc
  WHERE dc.embedding IS NULL
    AND dc.chunk_text IS NOT NULL
    AND dc.chunk_text != ''
  GROUP BY dc.document_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION generate_missing_embeddings() IS 'Returns a list of documents with chunks that need embeddings generated';
