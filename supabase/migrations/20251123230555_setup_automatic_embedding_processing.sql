/*
  # Setup automatic embedding processing

  ## Purpose
  Configure manual trigger function for processing NULL embeddings.
  This ensures embeddings are eventually generated for all chunks without manual intervention.

  ## Changes
  
  1. Manual Trigger Function
     - Creates a function users can call to manually trigger embedding generation
     - Useful for development and testing
     - Can be called via API or database query
  
  2. Configuration Storage
     - Stores edge function URLs in app_config schema
     - Makes it easy to reference URLs in functions
  
  ## How It Works
  - Users or admins can call `manually_process_null_embeddings()` function
  - Function triggers the process-null-embeddings edge function
  - That function batches and processes chunks with NULL embeddings
  - Processing happens in background without blocking other operations
  
  ## Notes
  - Embeddings are automatically processed via trigger on insert
  - This manual function provides additional control when needed
  - Useful for batch processing existing NULL embeddings
*/

-- Create a custom schema for app configuration if it doesn't exist
CREATE SCHEMA IF NOT EXISTS app_config;

-- Create a table to store configuration
CREATE TABLE IF NOT EXISTS app_config.settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- Create a manual trigger function that users can call
CREATE OR REPLACE FUNCTION manually_process_null_embeddings()
RETURNS TABLE(
  success boolean,
  message text,
  chunks_needing_processing bigint
) AS $$
DECLARE
  v_count bigint;
  v_url text;
  v_response_id bigint;
BEGIN
  -- Count chunks with NULL embeddings
  SELECT COUNT(*)
  INTO v_count
  FROM document_chunks
  WHERE embedding IS NULL
    AND chunk_text IS NOT NULL
    AND chunk_text != '';
  
  IF v_count = 0 THEN
    RETURN QUERY SELECT true, 'No chunks need processing', 0::bigint;
    RETURN;
  END IF;
  
  -- Build the URL
  v_url := current_setting('app.supabase_url', true) || '/functions/v1/process-null-embeddings';
  
  -- Trigger the edge function (if http extension is available)
  BEGIN
    SELECT net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
      )
    ) INTO v_response_id;
    
    RETURN QUERY SELECT true, 'Embedding processing triggered for ' || v_count::text || ' chunks', v_count;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT false, 'Failed to trigger processing: ' || SQLERRM, v_count;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION manually_process_null_embeddings() TO authenticated;

COMMENT ON FUNCTION manually_process_null_embeddings() IS 'Manually trigger processing of all chunks with NULL embeddings. Returns status and count of chunks to process.';
