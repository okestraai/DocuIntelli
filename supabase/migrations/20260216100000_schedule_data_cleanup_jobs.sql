/*
  # Schedule Data Cleanup Cron Jobs

  Adds pg_cron jobs for recurring data hygiene tasks.
  All cleanup runs monthly on the 1st at 02:00 UTC to minimize impact.

  Jobs:
    1. Purge notification_logs older than 90 days
    2. Purge usage_logs older than 30 days
    3. Purge limit_violations older than 180 days
    4. Purge review_events older than 365 days
    5. Delete orphaned document_chunks (no parent document)

  NOTE: pg_cron is pre-enabled on Supabase hosted projects.
*/

-- ============================================================================
-- 1. Notification Logs Cleanup (90 days retention)
-- ============================================================================

SELECT cron.schedule(
    'cleanup-notification-logs-monthly',
    '0 2 1 * *',
    $$DELETE FROM notification_logs WHERE sent_at < now() - interval '90 days'$$
);

-- ============================================================================
-- 2. Usage Logs Cleanup (30 days retention)
-- ============================================================================

SELECT cron.schedule(
    'cleanup-usage-logs-monthly',
    '5 2 1 * *',
    $$DELETE FROM usage_logs WHERE timestamp < now() - interval '30 days'$$
);

-- ============================================================================
-- 3. Limit Violations Cleanup (180 days retention)
-- ============================================================================

SELECT cron.schedule(
    'cleanup-limit-violations-monthly',
    '10 2 1 * *',
    $$DELETE FROM limit_violations WHERE timestamp < now() - interval '180 days'$$
);

-- ============================================================================
-- 4. Review Events Archival (365 days retention)
-- ============================================================================

SELECT cron.schedule(
    'cleanup-review-events-monthly',
    '15 2 1 * *',
    $$DELETE FROM review_events WHERE created_at < now() - interval '365 days'$$
);

-- ============================================================================
-- 5. Orphaned Chunks Cleanup (chunks with no parent document)
-- ============================================================================

SELECT cron.schedule(
    'cleanup-orphaned-chunks-weekly',
    '0 3 * * 0',
    $$DELETE FROM document_chunks WHERE document_id NOT IN (SELECT id FROM documents)$$
);
