-- Granular Notification Preferences
-- Replaces the 3 basic boolean toggles with 6 category-based preference groups.
--
-- Categories:
--   1. security_alerts     - Login, password, suspicious activity (always recommended on)
--   2. billing_alerts      - Payments, subscriptions, plan changes
--   3. document_alerts     - Uploads, processing, expirations, deletions, health
--   4. engagement_digests  - Weekly/daily/monthly summaries, gap suggestions, score changes
--   5. life_event_alerts   - Life events, readiness, requirements
--   6. activity_alerts     - Profile changes, preference updates, metadata changes

-- Add new granular preference columns to user_profiles (defaults to true)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS billing_alerts boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS document_alerts boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS engagement_digests boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS life_event_alerts boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS activity_alerts boolean DEFAULT true;

-- Migrate existing preferences to new columns:
-- email_notifications -> billing_alerts + activity_alerts
-- document_reminders  -> document_alerts + engagement_digests + life_event_alerts
-- security_alerts     -> stays as-is (already exists)
UPDATE user_profiles
SET
  billing_alerts      = COALESCE(email_notifications, true),
  document_alerts     = COALESCE(document_reminders, true),
  engagement_digests  = COALESCE(document_reminders, true),
  life_event_alerts   = COALESCE(document_reminders, true),
  activity_alerts     = COALESCE(email_notifications, true);

-- Also add columns to user_subscriptions for backend compatibility
ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS billing_alerts boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS document_alerts boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS engagement_digests boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS life_event_alerts boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS activity_alerts boolean DEFAULT true;

-- Sync user_subscriptions from user_profiles where both exist
UPDATE user_subscriptions us
SET
  billing_alerts      = COALESCE(up.billing_alerts, true),
  document_alerts     = COALESCE(up.document_alerts, true),
  engagement_digests  = COALESCE(up.engagement_digests, true),
  life_event_alerts   = COALESCE(up.life_event_alerts, true),
  activity_alerts     = COALESCE(up.activity_alerts, true),
  security_alerts     = COALESCE(up.security_alerts, true)
FROM user_profiles up
WHERE us.user_id = up.id;

-- Note: We keep the old columns (email_notifications, document_reminders)
-- for backwards compatibility. They can be removed in a future migration.
