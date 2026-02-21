/*
  # Schedule AI Questions Monthly Reset

  Adds a pg_cron job that runs daily at 00:05 UTC to reset the AI questions
  counter for any user whose ai_questions_reset_date has passed.

  The existing reset_ai_questions_counter() function (from 20260117 migration)
  already handles the logic:
    - Only resets users WHERE ai_questions_reset_date <= now()
    - Sets ai_questions_used = 0
    - Advances ai_questions_reset_date by 1 month

  Running daily ensures resets happen within hours of each user's anniversary,
  regardless of when they signed up.

  NOTE: pg_cron is pre-enabled on Supabase hosted projects. Do NOT re-create the extension.
*/

-- Remove existing job if re-running this migration (idempotent)
SELECT cron.unschedule('reset-ai-questions-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reset-ai-questions-daily');

-- Schedule the AI questions reset to run daily at 00:05 UTC
SELECT cron.schedule(
    'reset-ai-questions-daily',
    '5 0 * * *',
    $$SELECT reset_ai_questions_counter()$$
);
