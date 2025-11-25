/*
  # Setup Scheduled Embedding Processor
  
  Creates a scheduled job that runs every 1 minute to process NULL embeddings.
  Uses pg_net extension to call the scheduled-embedding-processor edge function.
  
  ## Changes
  - Create a function to trigger the scheduled embedding processor
  - Schedule it to run every 1 minute using pg_cron (if available)
  
  Note: If pg_cron is not available, this function can be called manually or via other scheduling methods.
*/

-- Enable pg_net extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create function to trigger the scheduled embedding processor
CREATE OR REPLACE FUNCTION trigger_scheduled_embedding_processor()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_supabase_url TEXT;
  v_service_role_key TEXT;
  v_function_url TEXT;
  v_request_id BIGINT;
BEGIN
  -- Get Supabase URL and service role key from environment
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_role_key := current_setting('app.settings.service_role_key', true);
  
  -- Fallback to vault if settings not available
  IF v_supabase_url IS NULL THEN
    SELECT decrypted_secret INTO v_supabase_url 
    FROM vault.decrypted_secrets 
    WHERE name = 'SUPABASE_URL' 
    LIMIT 1;
  END IF;
  
  IF v_service_role_key IS NULL THEN
    SELECT decrypted_secret INTO v_service_role_key 
    FROM vault.decrypted_secrets 
    WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' 
    LIMIT 1;
  END IF;
  
  -- If still null, use SUPABASE_URL from environment
  IF v_supabase_url IS NULL THEN
    v_supabase_url := COALESCE(
      current_setting('request.headers', true)::json->>'x-forwarded-host',
      'https://caygpjhiakabaxtklnlw.supabase.co'
    );
    IF NOT v_supabase_url LIKE 'http%' THEN
      v_supabase_url := 'https://' || v_supabase_url;
    END IF;
  END IF;
  
  v_function_url := v_supabase_url || '/functions/v1/scheduled-embedding-processor';
  
  RAISE LOG 'Triggering scheduled embedding processor: %', v_function_url;
  
  -- Make async HTTP POST request to the edge function
  SELECT net.http_post(
    url := v_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(v_service_role_key, '')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) INTO v_request_id;
  
  RAISE LOG 'Scheduled embedding processor triggered with request_id: %', v_request_id;
END;
$$;

-- Grant execute permission to authenticated users (though typically this would run as a scheduled job)
GRANT EXECUTE ON FUNCTION trigger_scheduled_embedding_processor() TO authenticated;
GRANT EXECUTE ON FUNCTION trigger_scheduled_embedding_processor() TO service_role;

-- Add comment explaining the function
COMMENT ON FUNCTION trigger_scheduled_embedding_processor() IS 
'Triggers the scheduled-embedding-processor edge function to process NULL embeddings. 
This should be called every 1 minute via an external scheduler (e.g., GitHub Actions, Vercel Cron, or Supabase Cron).
Since pg_cron is not available in this environment, use an external cron service to call this function or the edge function directly.';
