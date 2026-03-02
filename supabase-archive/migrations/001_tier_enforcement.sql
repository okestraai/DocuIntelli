-- Migration: Tier Enforcement System
-- Description: Add feature flags, update limits, and create usage tracking tables
-- Date: 2026-02-11

-- ============================================================================
-- 1. Add feature_flags column to user_subscriptions
-- ============================================================================

ALTER TABLE user_subscriptions
ADD COLUMN IF NOT EXISTS feature_flags JSONB DEFAULT '{}';

-- ============================================================================
-- 2. Update default limits for free tier
-- ============================================================================

ALTER TABLE user_subscriptions
  ALTER COLUMN document_limit SET DEFAULT 3,
  ALTER COLUMN ai_questions_limit SET DEFAULT 5;

-- ============================================================================
-- 3. Update existing free tier users
-- ============================================================================

UPDATE user_subscriptions
SET
  document_limit = 3,
  ai_questions_limit = 5,
  updated_at = NOW()
WHERE plan = 'free';

-- ============================================================================
-- 4. Set feature flags based on plan
-- ============================================================================

-- Free tier: minimal features
UPDATE user_subscriptions
SET feature_flags = jsonb_build_object(
  'url_ingestion', false,
  'ocr_enabled', false,
  'auto_tags', false,
  'background_embedding', false,
  'priority_queue', 0,
  'email_notifications', false,
  'multi_device_sync', false,
  'priority_support', false
),
updated_at = NOW()
WHERE plan = 'free';

-- Starter tier: core paid features
UPDATE user_subscriptions
SET feature_flags = jsonb_build_object(
  'url_ingestion', true,
  'ocr_enabled', true,
  'auto_tags', true,
  'background_embedding', true,
  'priority_queue', 1,
  'email_notifications', true,
  'multi_device_sync', false,
  'priority_support', false
),
document_limit = 25,
ai_questions_limit = 999999,
updated_at = NOW()
WHERE plan = 'starter';

-- Pro tier: all features
UPDATE user_subscriptions
SET feature_flags = jsonb_build_object(
  'url_ingestion', true,
  'ocr_enabled', true,
  'auto_tags', true,
  'background_embedding', true,
  'priority_queue', 2,
  'email_notifications', true,
  'multi_device_sync', true,
  'priority_support', true
),
document_limit = 100,
ai_questions_limit = 999999,
updated_at = NOW()
WHERE plan = 'pro';

-- ============================================================================
-- 5. Create usage_logs table for analytics
-- ============================================================================

CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  metadata JSONB,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_timestamp ON usage_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_logs_feature ON usage_logs(feature);

-- Enable RLS
ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own logs
CREATE POLICY usage_logs_select_policy ON usage_logs
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Service role can insert
CREATE POLICY usage_logs_insert_policy ON usage_logs
  FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- 6. Create limit_violations table for monitoring
-- ============================================================================

CREATE TABLE IF NOT EXISTS limit_violations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  limit_type TEXT NOT NULL,
  current_value INTEGER,
  limit_value INTEGER,
  metadata JSONB,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_limit_violations_user_id ON limit_violations(user_id);
CREATE INDEX IF NOT EXISTS idx_limit_violations_timestamp ON limit_violations(timestamp);
CREATE INDEX IF NOT EXISTS idx_limit_violations_type ON limit_violations(limit_type);

-- Enable RLS
ALTER TABLE limit_violations ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can see their own violations
CREATE POLICY limit_violations_select_policy ON limit_violations
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Service role can insert
CREATE POLICY limit_violations_insert_policy ON limit_violations
  FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- 7. Create function to automatically set feature flags on insert
-- ============================================================================

CREATE OR REPLACE FUNCTION set_subscription_defaults()
RETURNS TRIGGER AS $$
BEGIN
  -- Set feature flags based on plan
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
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS set_subscription_defaults_trigger ON user_subscriptions;

-- Create trigger
CREATE TRIGGER set_subscription_defaults_trigger
  BEFORE INSERT OR UPDATE OF plan ON user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION set_subscription_defaults();

-- ============================================================================
-- 8. Create helper function to check document limit
-- ============================================================================

CREATE OR REPLACE FUNCTION check_document_limit(p_user_id UUID)
RETURNS TABLE(
  can_upload BOOLEAN,
  current_count INTEGER,
  limit_count INTEGER,
  plan TEXT
) AS $$
DECLARE
  v_subscription RECORD;
  v_doc_count INTEGER;
BEGIN
  -- Get user's subscription
  SELECT * INTO v_subscription
  FROM user_subscriptions
  WHERE user_id = p_user_id;

  -- Count user's documents
  SELECT COUNT(*) INTO v_doc_count
  FROM documents
  WHERE user_id = p_user_id;

  -- Return result
  RETURN QUERY SELECT
    v_doc_count < v_subscription.document_limit AS can_upload,
    v_doc_count AS current_count,
    v_subscription.document_limit AS limit_count,
    v_subscription.plan AS plan;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. Create helper function to check AI question limit
-- ============================================================================

CREATE OR REPLACE FUNCTION check_ai_question_limit(p_user_id UUID)
RETURNS TABLE(
  can_ask BOOLEAN,
  current_count INTEGER,
  limit_count INTEGER,
  plan TEXT
) AS $$
DECLARE
  v_subscription RECORD;
BEGIN
  -- Get user's subscription
  SELECT * INTO v_subscription
  FROM user_subscriptions
  WHERE user_id = p_user_id;

  -- Paid plans have unlimited questions
  IF v_subscription.plan != 'free' THEN
    RETURN QUERY SELECT
      true AS can_ask,
      v_subscription.ai_questions_used AS current_count,
      v_subscription.ai_questions_limit AS limit_count,
      v_subscription.plan AS plan;
  ELSE
    -- Check free tier limit
    RETURN QUERY SELECT
      v_subscription.ai_questions_used < v_subscription.ai_questions_limit AS can_ask,
      v_subscription.ai_questions_used AS current_count,
      v_subscription.ai_questions_limit AS limit_count,
      v_subscription.plan AS plan;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 10. Create analytics views
-- ============================================================================

-- View: Users approaching limits
CREATE OR REPLACE VIEW users_approaching_limits AS
SELECT
  u.id as user_id,
  u.email,
  s.plan,
  COUNT(d.id) as document_count,
  s.document_limit,
  s.ai_questions_used,
  s.ai_questions_limit,
  ROUND((COUNT(d.id)::DECIMAL / s.document_limit * 100), 2) as document_usage_pct,
  ROUND((s.ai_questions_used::DECIMAL / NULLIF(s.ai_questions_limit, 0) * 100), 2) as ai_usage_pct
FROM auth.users u
JOIN user_subscriptions s ON s.user_id = u.id
LEFT JOIN documents d ON d.user_id = u.id
GROUP BY u.id, u.email, s.plan, s.document_limit, s.ai_questions_used, s.ai_questions_limit
HAVING COUNT(d.id)::DECIMAL / s.document_limit >= 0.8
    OR (s.ai_questions_used::DECIMAL / NULLIF(s.ai_questions_limit, 0)) >= 0.8;

-- View: Feature usage by tier
CREATE OR REPLACE VIEW feature_usage_by_tier AS
SELECT
  s.plan,
  ul.feature,
  COUNT(DISTINCT ul.user_id) as unique_users,
  COUNT(*) as total_uses,
  DATE_TRUNC('day', ul.timestamp) as usage_date
FROM usage_logs ul
JOIN user_subscriptions s ON s.user_id = ul.user_id
WHERE ul.timestamp > NOW() - INTERVAL '30 days'
GROUP BY s.plan, ul.feature, DATE_TRUNC('day', ul.timestamp);

-- ============================================================================
-- Migration Complete
-- ============================================================================

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE 'Migration 001_tier_enforcement completed successfully';
  RAISE NOTICE 'Feature flags added to all subscriptions';
  RAISE NOTICE 'Usage tracking tables created';
  RAISE NOTICE 'Helper functions and views created';
END $$;
