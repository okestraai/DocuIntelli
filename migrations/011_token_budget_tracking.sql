-- ═══════════════════════════════════════════════════════════════
-- Migration 011: Token Budget Tracking for LLM Routing
-- ═══════════════════════════════════════════════════════════════
-- Adds per-user monthly token budget columns to user_subscriptions
-- and updates the trigger to set defaults per plan tier.

-- ── Add columns ──────────────────────────────────────────────

ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS tokens_used       bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tokens_limit      bigint NOT NULL DEFAULT 50000,
  ADD COLUMN IF NOT EXISTS tokens_reset_date timestamptz;

-- ── Update existing rows with correct limits ─────────────────

UPDATE user_subscriptions SET tokens_limit = 50000    WHERE plan = 'free'    AND tokens_limit = 50000;
UPDATE user_subscriptions SET tokens_limit = 500000   WHERE plan = 'starter';
UPDATE user_subscriptions SET tokens_limit = 2000000  WHERE plan = 'pro';

-- ── Update trigger to set tokens_limit per plan ─────────────

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
      'priority_support', false,
      'global_search', false
    );
    NEW.document_limit = 3;
    NEW.ai_questions_limit = 5;
    NEW.monthly_upload_limit = 3;
    NEW.tokens_limit = 50000;
  ELSIF NEW.plan = 'starter' THEN
    NEW.feature_flags = jsonb_build_object(
      'url_ingestion', true,
      'ocr_enabled', true,
      'auto_tags', true,
      'background_embedding', true,
      'priority_queue', 1,
      'email_notifications', true,
      'multi_device_sync', false,
      'priority_support', false,
      'global_search', false
    );
    NEW.document_limit = 25;
    NEW.ai_questions_limit = 999999;
    NEW.monthly_upload_limit = 30;
    NEW.tokens_limit = 500000;
  ELSIF NEW.plan = 'pro' THEN
    NEW.feature_flags = jsonb_build_object(
      'url_ingestion', true,
      'ocr_enabled', true,
      'auto_tags', true,
      'background_embedding', true,
      'priority_queue', 2,
      'email_notifications', true,
      'multi_device_sync', true,
      'priority_support', true,
      'global_search', true
    );
    NEW.document_limit = 100;
    NEW.ai_questions_limit = 999999;
    NEW.monthly_upload_limit = 150;
    NEW.tokens_limit = 2000000;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'set_subscription_defaults failed for plan %: %', NEW.plan, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
