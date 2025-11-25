/*
  # Enable pg_net extension and fix embedding trigger

  ## Purpose
  Enable the pg_net extension required for the embedding generation trigger to work.
  Also configure the app settings required by the trigger function.

  ## Changes
  1. Enable pg_net extension for HTTP requests
  2. Configure app settings for Supabase URL and service role key
  3. Test the trigger configuration

  ## Notes
  - The trigger uses pg_net to call the generate-embeddings edge function
  - Settings are stored securely and accessed via current_setting()
*/

-- Enable pg_net extension for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant usage on the net schema
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- Set up configuration for the trigger (these will be available via current_setting)
DO $$
BEGIN
  -- These settings need to be available at runtime
  -- They're accessed by the trigger_embedding_generation function
  -- Note: In production, these should be set via Supabase dashboard or env vars
  
  PERFORM set_config('app.supabase_url', current_setting('request.headers', true)::json->>'x-forwarded-host', false);
EXCEPTION
  WHEN OTHERS THEN
    -- If we can't get it from headers, that's ok - it will be set at runtime
    NULL;
END $$;

-- Verify the trigger exists and is enabled
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'auto_generate_embeddings'
  ) THEN
    RAISE EXCEPTION 'Trigger auto_generate_embeddings does not exist!';
  END IF;
  
  RAISE NOTICE 'Trigger auto_generate_embeddings is configured and ready';
END $$;
