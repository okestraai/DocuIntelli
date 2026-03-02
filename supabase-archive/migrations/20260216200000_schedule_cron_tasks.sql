/*
  # Schedule All Cron Tasks via pg_cron → Edge Function

  Creates a SQL trigger function that calls the cron-tasks edge function,
  then schedules all 7 recurring jobs via pg_cron.

  Pattern: pg_cron → trigger_cron_task(task_name) → net.http_post → cron-tasks edge function

  Jobs:
    1. expiration-notifications     — Daily at 08:00 UTC
    2. weekly-audit-email           — Sunday at 22:00 UTC
    3. preparedness-snapshots       — Daily at 00:30 UTC
    4. stripe-billing-sync          — Daily at 05:00 UTC
    5. life-event-readiness         — Daily at 03:00 UTC
    6. review-cadence-reminders     — Monday at 09:00 UTC
    7. stuck-docs-processing        — Every 30 minutes

  Required Supabase Secrets (set via `supabase secrets set`):
    - SMTP_USER     (Mailjet API Key)
    - SMTP_PASS     (Mailjet Secret Key)
    - FROM_EMAIL    (sender email)
    - APP_URL       (frontend URL for email links)

  NOTE: pg_cron and pg_net are pre-enabled on Supabase hosted projects.
*/

-- Ensure pg_net is available for HTTP calls
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ============================================================================
-- Trigger function: calls cron-tasks edge function with a task name
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_cron_task(task_name TEXT)
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
  -- Get Supabase URL and service role key
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

  -- Last-resort fallback
  IF v_supabase_url IS NULL THEN
    v_supabase_url := COALESCE(
      current_setting('request.headers', true)::json->>'x-forwarded-host',
      'https://caygpjhiakabaxtklnlw.supabase.co'
    );
    IF NOT v_supabase_url LIKE 'http%' THEN
      v_supabase_url := 'https://' || v_supabase_url;
    END IF;
  END IF;

  v_function_url := v_supabase_url || '/functions/v1/cron-tasks';

  RAISE LOG 'Triggering cron task "%": %', task_name, v_function_url;

  SELECT net.http_post(
    url := v_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(v_service_role_key, '')
    ),
    body := jsonb_build_object('task', task_name),
    timeout_milliseconds := 55000
  ) INTO v_request_id;

  RAISE LOG 'Cron task "%" triggered, request_id: %', task_name, v_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION trigger_cron_task(TEXT) TO service_role;

-- ============================================================================
-- Schedule all cron jobs
-- ============================================================================

-- 1. Expiration Notifications — Daily at 08:00 UTC
SELECT cron.schedule(
    'cron-expiration-notifications',
    '0 8 * * *',
    $$SELECT trigger_cron_task('expiration-notifications')$$
);

-- 2. Weekly Audit Email — Sunday at 22:00 UTC
SELECT cron.schedule(
    'cron-weekly-audit-email',
    '0 22 * * 0',
    $$SELECT trigger_cron_task('weekly-audit-email')$$
);

-- 3. Preparedness Snapshots — Daily at 00:30 UTC
SELECT cron.schedule(
    'cron-preparedness-snapshots',
    '30 0 * * *',
    $$SELECT trigger_cron_task('preparedness-snapshots')$$
);

-- 4. Stripe Billing Reconciliation — Daily at 05:00 UTC
SELECT cron.schedule(
    'cron-stripe-billing-sync',
    '0 5 * * *',
    $$SELECT trigger_cron_task('stripe-billing-sync')$$
);

-- 5. Life Event Readiness — Daily at 03:00 UTC
SELECT cron.schedule(
    'cron-life-event-readiness',
    '0 3 * * *',
    $$SELECT trigger_cron_task('life-event-readiness')$$
);

-- 6. Review Cadence Reminders — Monday at 09:00 UTC
SELECT cron.schedule(
    'cron-review-cadence-reminders',
    '0 9 * * 1',
    $$SELECT trigger_cron_task('review-cadence-reminders')$$
);

-- 7. Stuck Docs Processing — Every 30 minutes
SELECT cron.schedule(
    'cron-stuck-docs-processing',
    '*/30 * * * *',
    $$SELECT trigger_cron_task('stuck-docs-processing')$$
);
