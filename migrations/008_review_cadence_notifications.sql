-- 008_review_cadence_notifications.sql
-- Extend in_app_notifications type constraint to support review cadence notifications.

-- Drop the existing type check and add review_due_soon + review_overdue
ALTER TABLE in_app_notifications DROP CONSTRAINT IF EXISTS in_app_notifications_type_check;

ALTER TABLE in_app_notifications ADD CONSTRAINT in_app_notifications_type_check
  CHECK (type IN (
    'goal_milestone', 'goal_completed', 'goal_expired', 'system',
    'review_due_soon', 'review_overdue'
  ));
