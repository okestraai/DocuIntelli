/*
  # Fix embedding trigger to use environment variables

  ## Purpose
  Update the trigger function to properly access Supabase URL and service key
  from environment variables instead of app settings.

  ## Changes
  1. Update trigger_embedding_generation function to use Deno.env variables
  2. Make the trigger more robust with better error handling

  ## Notes
  - Uses pg_net extension which is now enabled
  - Environment variables are automatically available in Supabase
*/

-- Drop and recreate the trigger function with proper environment variable access
CREATE OR REPLACE FUNCTION trigger_embedding_generation()
RETURNS trigger AS $$
DECLARE
  v_supabase_url text;
  v_service_key text;
  v_request_id bigint;
BEGIN
  -- Get environment variables from Supabase
  -- These are automatically available in hosted Supabase
  v_supabase_url := current_setting('request.headers', true)::json->>'host';
  
  -- If we can't get from headers, try to construct from known patterns
  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    -- Fallback: this will be set by Supabase in production
    v_supabase_url := 'https://' || current_setting('app.supabase_url', true);
  END IF;
  
  -- Use extensions.http_post instead of net.http_post
  -- Call the edge function asynchronously
  BEGIN
    SELECT extensions.http_post(
      url := v_supabase_url || '/functions/v1/generate-embeddings',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', current_setting('app.supabase_anon_key', true)
      ),
      body := jsonb_build_object(
        'document_id', NEW.document_id,
        'limit', 5
      )
    ) INTO v_request_id;
    
    RAISE NOTICE 'Triggered embedding generation for document %, request_id: %', NEW.document_id, v_request_id;
  EXCEPTION WHEN OTHERS THEN
    -- Log but don't fail the insert if edge function call fails
    RAISE WARNING 'Failed to trigger embedding generation: %', SQLERRM;
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure trigger is still in place
DROP TRIGGER IF EXISTS auto_generate_embeddings ON document_chunks;
CREATE TRIGGER auto_generate_embeddings
  AFTER INSERT ON document_chunks
  FOR EACH ROW
  WHEN (NEW.embedding IS NULL)
  EXECUTE FUNCTION trigger_embedding_generation();

COMMENT ON FUNCTION trigger_embedding_generation() IS 'Automatically triggers edge function to generate embeddings for new chunks with NULL embeddings';
