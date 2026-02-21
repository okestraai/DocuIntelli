/*
  # Reduce Free Tier Limits

  Old limits → New limits:
    - Documents:       5 → 3
    - Uploads/month:   5 → 3
    - AI questions/mo: 10 → 5

  This migration:
    1. Updates column defaults
    2. Updates the set_subscription_defaults() trigger function
    3. Updates the initialize_user_subscription() trigger function
    4. Applies new limits to all existing free-tier users
    5. Deletes excess documents (most recent first) for free-tier users over the new 3-doc limit
    6. Resets ai_questions_used for free-tier users who exceed the new 5-question cap
*/

-- ============================================================================
-- 1. Update column defaults
-- ============================================================================

ALTER TABLE user_subscriptions
  ALTER COLUMN document_limit SET DEFAULT 3,
  ALTER COLUMN ai_questions_limit SET DEFAULT 5,
  ALTER COLUMN monthly_upload_limit SET DEFAULT 3;

-- ============================================================================
-- 2. Update set_subscription_defaults() trigger — free tier branch only
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

-- ============================================================================
-- 3. Update initialize_user_subscription() for new signups
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

-- ============================================================================
-- 4. Apply new limits to all existing free-tier subscription rows
-- ============================================================================

UPDATE user_subscriptions
SET
  document_limit = 3,
  ai_questions_limit = 5,
  monthly_upload_limit = 3,
  updated_at = now()
WHERE plan = 'free';

-- ============================================================================
-- 5. Delete excess documents for free-tier users (keep oldest 3, delete newest)
-- ============================================================================

DELETE FROM documents
WHERE id IN (
  SELECT d.id
  FROM documents d
  JOIN user_subscriptions us ON us.user_id = d.user_id
  WHERE us.plan = 'free'
    AND d.id NOT IN (
      SELECT d2.id
      FROM documents d2
      WHERE d2.user_id = d.user_id
      ORDER BY d2.created_at ASC
      LIMIT 3
    )
);

-- ============================================================================
-- 6. Cap ai_questions_used at 5 for free-tier users who exceeded the new limit
-- ============================================================================

UPDATE user_subscriptions
SET
  ai_questions_used = 5,
  updated_at = now()
WHERE plan = 'free'
  AND ai_questions_used > 5;
