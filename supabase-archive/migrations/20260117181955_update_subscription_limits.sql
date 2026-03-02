/*
  # Update Subscription Limits and Plans

  1. Changes
    - Update free plan limits: 2 documents, 5 AI questions
    - Add "starter" plan to CHECK constraint
    - Update default values in user_subscriptions table
    - Update trigger function to use new limits

  2. Plan Structure
    - Free: 2 documents, 5 AI questions/month
    - Starter: 25 documents, 50 AI questions/month
    - Pro: 100 documents, 200 AI questions/month
    - Business: Coming soon (500 AI questions/month when available)
*/

-- Drop and recreate the CHECK constraint to include 'starter' plan
ALTER TABLE user_subscriptions DROP CONSTRAINT IF EXISTS user_subscriptions_plan_check;
ALTER TABLE user_subscriptions
  ADD CONSTRAINT user_subscriptions_plan_check
  CHECK (plan IN ('free', 'starter', 'pro', 'business'));

-- Update default values for free plan
ALTER TABLE user_subscriptions
  ALTER COLUMN document_limit SET DEFAULT 2;

ALTER TABLE user_subscriptions
  ALTER COLUMN ai_questions_limit SET DEFAULT 5;

-- Update the trigger function to use new free plan limits
CREATE OR REPLACE FUNCTION initialize_user_subscription()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_subscriptions (user_id, plan, status, document_limit, ai_questions_limit)
  VALUES (NEW.id, 'free', 'active', 2, 5)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update existing free plan users to new limits (optional - comment out if you want to grandfather existing users)
-- UPDATE user_subscriptions
-- SET document_limit = 2, ai_questions_limit = 5, updated_at = now()
-- WHERE plan = 'free';
