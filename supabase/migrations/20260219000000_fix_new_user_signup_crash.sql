-- ============================================================================
-- Fix: "Database error saving new user" on Google OAuth / new signup
--
-- Root cause: Later migrations (monthly_upload_quota, reduce_free_tier_limits)
-- replaced initialize_user_subscription() and set_subscription_defaults()
-- WITHOUT the EXCEPTION WHEN OTHERS block or SET search_path that was added
-- in 20260214400000_fix_auth_triggers.sql. Any unhandled error in these
-- trigger functions rolls back the entire auth.users INSERT.
--
-- This migration:
--   1. Ensures all required columns exist on user_subscriptions
--   2. Rebuilds handle_new_user() with full error handling
--   3. Rebuilds initialize_user_subscription() with full error handling
--   4. Rebuilds set_subscription_defaults() with full error handling
--   5. Ensures CHECK constraints accept all valid plan/status values
-- ============================================================================

-- ============================================================================
-- 1. Ensure required columns exist (safe if already present)
-- ============================================================================

ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS feature_flags JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS monthly_upload_limit INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS monthly_uploads_used INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_upload_reset_date TIMESTAMPTZ NOT NULL DEFAULT now() + interval '1 month',
  ADD COLUMN IF NOT EXISTS pending_plan TEXT,
  ADD COLUMN IF NOT EXISTS documents_to_keep TEXT[];

-- ============================================================================
-- 2. Ensure CHECK constraints are up to date
-- ============================================================================

-- Plan constraint: must include 'starter'
ALTER TABLE user_subscriptions DROP CONSTRAINT IF EXISTS user_subscriptions_plan_check;
ALTER TABLE user_subscriptions
  ADD CONSTRAINT user_subscriptions_plan_check
  CHECK (plan IN ('free', 'starter', 'pro', 'business'));

-- Status constraint: must include 'canceling'
ALTER TABLE user_subscriptions DROP CONSTRAINT IF EXISTS user_subscriptions_status_check;
ALTER TABLE user_subscriptions
  ADD CONSTRAINT user_subscriptions_status_check
  CHECK (status IN ('active', 'canceled', 'canceling', 'expired', 'trialing'));

-- ============================================================================
-- 3. Fix handle_new_user() — Google OAuth display_name + error handling
-- ============================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'display_name', ''),
      NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
      NULLIF(NEW.raw_user_meta_data->>'name', ''),
      ''
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;   -- let the user be created even if profile insert fails
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- ============================================================================
-- 4. Fix initialize_user_subscription() — error handling + search_path
-- ============================================================================

CREATE OR REPLACE FUNCTION initialize_user_subscription()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_subscriptions (
    user_id, plan, status, document_limit, ai_questions_limit, monthly_upload_limit
  )
  VALUES (NEW.id, 'free', 'active', 3, 5, 3)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'initialize_user_subscription failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;   -- let the user be created even if subscription insert fails
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- ============================================================================
-- 5. Fix set_subscription_defaults() — add error handling
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
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'set_subscription_defaults failed for plan %: %', NEW.plan, SQLERRM;
  RETURN NEW;   -- allow the insert to proceed with whatever values it has
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. Re-create triggers (ensures correct binding)
-- ============================================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;
CREATE TRIGGER on_auth_user_created_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION initialize_user_subscription();

DROP TRIGGER IF EXISTS set_subscription_defaults_trigger ON user_subscriptions;
CREATE TRIGGER set_subscription_defaults_trigger
  BEFORE INSERT OR UPDATE OF plan ON user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION set_subscription_defaults();
