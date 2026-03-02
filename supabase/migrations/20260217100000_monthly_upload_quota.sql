/*
  # Monthly Upload Quota

  Adds a monthly upload quota to prevent document-cycling abuse.
  Users who delete and re-upload documents to stay under the storage cap
  will now be constrained by a per-month upload counter.

  Quotas:
    - Free:    3 uploads/month
    - Starter: 30 uploads/month
    - Pro:     150 uploads/month

  Pattern mirrors the existing ai_questions_used / ai_questions_reset_date system.
*/

-- ============================================================================
-- 1. Add new columns to user_subscriptions
-- ============================================================================

ALTER TABLE user_subscriptions
ADD COLUMN IF NOT EXISTS monthly_upload_limit INTEGER NOT NULL DEFAULT 3,
ADD COLUMN IF NOT EXISTS monthly_uploads_used INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS monthly_upload_reset_date TIMESTAMPTZ NOT NULL DEFAULT now() + interval '1 month';

-- ============================================================================
-- 2. Back-fill existing rows per plan
-- ============================================================================

UPDATE user_subscriptions
SET monthly_upload_limit = 3, updated_at = now()
WHERE plan = 'free';

UPDATE user_subscriptions
SET monthly_upload_limit = 30, updated_at = now()
WHERE plan = 'starter';

UPDATE user_subscriptions
SET monthly_upload_limit = 150, updated_at = now()
WHERE plan = 'pro';

-- ============================================================================
-- 3. Reset function (runs daily, resets users whose window has elapsed)
-- ============================================================================

CREATE OR REPLACE FUNCTION reset_monthly_upload_counter()
RETURNS void AS $$
BEGIN
  UPDATE user_subscriptions
  SET
    monthly_uploads_used = 0,
    monthly_upload_reset_date = now() + interval '1 month',
    updated_at = now()
  WHERE monthly_upload_reset_date <= now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. Schedule pg_cron job (daily at 00:10 UTC, staggered from AI reset at 00:05)
-- ============================================================================

SELECT cron.unschedule('reset-monthly-uploads-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reset-monthly-uploads-daily');

SELECT cron.schedule(
    'reset-monthly-uploads-daily',
    '10 0 * * *',
    $$SELECT reset_monthly_upload_counter()$$
);

-- ============================================================================
-- 5. Update set_subscription_defaults() trigger to include monthly_upload_limit
-- ============================================================================

CREATE OR REPLACE FUNCTION set_subscription_defaults()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.plan = 'free' THEN
    NEW.feature_flags = jsonb_build_object(
      'url_ingestion', false,
      'ocr_enabled', false,
      'auto_tags', false,
      'background_embedding', false,
      'priority_queue', 0,
      'email_notifications', false,
      'multi_device_sync', false,
      'priority_support', false
    );
    NEW.document_limit = 3;
    NEW.ai_questions_limit = 5;
    NEW.monthly_upload_limit = 3;
  ELSIF NEW.plan = 'starter' THEN
    NEW.feature_flags = jsonb_build_object(
      'url_ingestion', true,
      'ocr_enabled', true,
      'auto_tags', true,
      'background_embedding', true,
      'priority_queue', 1,
      'email_notifications', true,
      'multi_device_sync', false,
      'priority_support', false
    );
    NEW.document_limit = 25;
    NEW.ai_questions_limit = 999999;
    NEW.monthly_upload_limit = 30;
  ELSIF NEW.plan = 'pro' THEN
    NEW.feature_flags = jsonb_build_object(
      'url_ingestion', true,
      'ocr_enabled', true,
      'auto_tags', true,
      'background_embedding', true,
      'priority_queue', 2,
      'email_notifications', true,
      'multi_device_sync', true,
      'priority_support', true
    );
    NEW.document_limit = 100;
    NEW.ai_questions_limit = 999999;
    NEW.monthly_upload_limit = 150;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-create trigger (uses OR REPLACE on function, trigger def unchanged)
DROP TRIGGER IF EXISTS set_subscription_defaults_trigger ON user_subscriptions;
CREATE TRIGGER set_subscription_defaults_trigger
  BEFORE INSERT OR UPDATE OF plan ON user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION set_subscription_defaults();

-- ============================================================================
-- 6. Update initialize_user_subscription() to include new columns
-- ============================================================================

CREATE OR REPLACE FUNCTION initialize_user_subscription()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_subscriptions (
    user_id, plan, status, document_limit, ai_questions_limit, monthly_upload_limit
  )
  VALUES (NEW.id, 'free', 'active', 3, 5, 3)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
