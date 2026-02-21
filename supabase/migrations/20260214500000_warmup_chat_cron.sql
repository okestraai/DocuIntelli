/*
  # Warm-up cron job for chat-document edge function

  Pings the chat-document edge function every 4 minutes to prevent
  cold starts. Uses the existing trigger_cron_task → cron-tasks
  dispatcher pattern.
*/

-- 8. Chat Document Warm-Up — Every 4 minutes
SELECT cron.schedule(
    'cron-warmup-chat',
    '*/4 * * * *',
    $$SELECT trigger_cron_task('warmup-chat')$$
);
