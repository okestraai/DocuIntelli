/*
  # Enable pg_cron and Schedule Embedding Processing
  
  Sets up pg_cron extension and creates a scheduled job that runs every 1 minute
  to process NULL embeddings by calling the scheduled-embedding-processor edge function.
  
  ## Changes
  - Enable pg_cron extension
  - Create a cron job that runs every 1 minute
  - Schedule calls to trigger_scheduled_embedding_processor function
*/

-- pg_cron is pre-enabled on Supabase hosted projects.
-- No need to CREATE EXTENSION or GRANT — it's already configured.

-- Schedule the embedding processor to run every 1 minute
-- This will call our trigger function which then calls the edge function
SELECT cron.schedule(
    'process-null-embeddings-every-minute',  -- Job name
    '* * * * *',                              -- Cron expression: every minute
    $$SELECT trigger_scheduled_embedding_processor()$$
);

-- Add a comment documenting the scheduled job
COMMENT ON EXTENSION pg_cron IS 
'Cron-based job scheduler. 
Current jobs:
- process-null-embeddings-every-minute: Runs every minute to process chunks with NULL embeddings';
