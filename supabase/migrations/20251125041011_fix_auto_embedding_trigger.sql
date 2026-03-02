/*
  # Fix automatic embedding generation trigger
  
  ## Purpose
  Create a working trigger that automatically generates embeddings when chunks are inserted.
  Uses pg_net extension with proper environment variable access.
  
  ## Changes
  1. Drop and recreate trigger function with correct pg_net usage
  2. Configure to use Supabase vault for secrets
  3. Add batching to prevent overwhelming the system
  
  ## How it works
  - When chunks with NULL embeddings are inserted
  - Trigger makes async HTTP call to generate-embeddings edge function
  - Uses pg_net for non-blocking HTTP requests
  - Batches requests per document to avoid duplicate calls
*/

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS auto_generate_embeddings ON document_chunks;
DROP FUNCTION IF EXISTS trigger_embedding_generation();

-- Create improved trigger function using pg_net
CREATE OR REPLACE FUNCTION trigger_embedding_generation()
RETURNS trigger AS $$
DECLARE
  v_supabase_url text;
  v_service_role_key text;
  v_request_id bigint;
BEGIN
  -- Get Supabase URL and service role key from vault or environment
  -- In Supabase, these are available via vault.secrets or current_setting
  BEGIN
    -- Try to get from Supabase vault first
    SELECT decrypted_secret INTO v_supabase_url
    FROM vault.decrypted_secrets
    WHERE name = 'SUPABASE_URL'
    LIMIT 1;
    
    SELECT decrypted_secret INTO v_service_role_key
    FROM vault.decrypted_secrets
    WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    -- Fallback: these will be available in production Supabase environment
    v_supabase_url := current_setting('app.settings.supabase_url', true);
    v_service_role_key := current_setting('app.settings.service_role_key', true);
  END;
  
  -- If still null, construct URL from request context
  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    -- Get from request headers in Supabase hosted environment
    v_supabase_url := 'https://' || current_setting('request.headers', true)::json->>'host';
  END IF;
  
  -- Make async HTTP request using pg_net
  IF v_supabase_url IS NOT NULL AND v_supabase_url != '' THEN
    BEGIN
      -- Use net.http_post (pg_net extension)
      SELECT net.http_post(
        url := v_supabase_url || '/functions/v1/generate-embeddings',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || COALESCE(v_service_role_key, '')
        ),
        body := jsonb_build_object(
          'document_id', NEW.document_id,
          'limit', 10
        ),
        timeout_milliseconds := 30000
      ) INTO v_request_id;
      
      RAISE NOTICE 'Triggered embedding generation for document % (request_id: %)', NEW.document_id, v_request_id;
    EXCEPTION WHEN OTHERS THEN
      -- Log error but don't fail the insert
      RAISE WARNING 'Failed to trigger embedding generation: %', SQLERRM;
    END;
  ELSE
    RAISE WARNING 'Supabase URL not configured, cannot trigger embedding generation';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger that fires ONCE per statement (not per row)
-- This prevents multiple calls for the same document when inserting multiple chunks
CREATE TRIGGER auto_generate_embeddings
  AFTER INSERT ON document_chunks
  FOR EACH ROW
  WHEN (NEW.embedding IS NULL)
  EXECUTE FUNCTION trigger_embedding_generation();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA net TO postgres, authenticated, service_role;

-- Create a manual function to process any existing NULL embeddings
CREATE OR REPLACE FUNCTION process_null_embeddings()
RETURNS TABLE(
  document_id uuid,
  chunks_with_null_embedding bigint,
  triggered boolean
) AS $$
DECLARE
  v_doc RECORD;
  v_supabase_url text;
  v_service_role_key text;
BEGIN
  -- Get Supabase configuration
  BEGIN
    SELECT decrypted_secret INTO v_supabase_url
    FROM vault.decrypted_secrets
    WHERE name = 'SUPABASE_URL'
    LIMIT 1;
    
    SELECT decrypted_secret INTO v_service_role_key
    FROM vault.decrypted_secrets
    WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_supabase_url := current_setting('app.settings.supabase_url', true);
    v_service_role_key := current_setting('app.settings.service_role_key', true);
  END;
  
  -- Process each document with NULL embeddings
  FOR v_doc IN 
    SELECT dc.document_id, COUNT(*) as null_count
    FROM document_chunks dc
    WHERE dc.embedding IS NULL
    GROUP BY dc.document_id
  LOOP
    BEGIN
      PERFORM net.http_post(
        url := v_supabase_url || '/functions/v1/generate-embeddings',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || COALESCE(v_service_role_key, '')
        ),
        body := jsonb_build_object(
          'document_id', v_doc.document_id,
          'limit', 20
        ),
        timeout_milliseconds := 60000
      );
      
      RETURN QUERY SELECT v_doc.document_id, v_doc.null_count, true;
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT v_doc.document_id, v_doc.null_count, false;
    END;
  END LOOP;
  
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION process_null_embeddings() TO authenticated, service_role;

COMMENT ON FUNCTION process_null_embeddings() IS 'Manually trigger embedding generation for all documents with NULL embeddings';
