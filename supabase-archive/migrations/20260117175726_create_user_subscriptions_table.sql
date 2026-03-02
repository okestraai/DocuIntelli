/*
  # Create User Subscriptions Table

  1. New Tables
    - `user_subscriptions`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `plan` (text) - free, pro, business
      - `status` (text) - active, canceled, expired, trialing
      - `stripe_customer_id` (text, nullable)
      - `stripe_subscription_id` (text, nullable)
      - `stripe_price_id` (text, nullable)
      - `current_period_start` (timestamptz, nullable)
      - `current_period_end` (timestamptz, nullable)
      - `cancel_at_period_end` (boolean)
      - `document_limit` (integer) - max documents allowed
      - `ai_questions_limit` (integer) - max AI questions per month
      - `ai_questions_used` (integer) - questions used this period
      - `ai_questions_reset_date` (timestamptz) - when to reset the counter
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `user_subscriptions` table
    - Add policies for users to read their own subscription
    - Add policy for service role to manage subscriptions

  3. Functions
    - Create function to initialize subscription for new users
    - Create trigger to auto-create free tier subscription on user signup
*/

-- Create user_subscriptions table
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'business')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'expired', 'trialing')),
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  document_limit integer NOT NULL DEFAULT 3,
  ai_questions_limit integer NOT NULL DEFAULT 5,
  ai_questions_used integer NOT NULL DEFAULT 0,
  ai_questions_reset_date timestamptz NOT NULL DEFAULT now() + interval '1 month',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

-- Policy for users to read their own subscription
CREATE POLICY "Users can read own subscription"
  ON user_subscriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy for users to update their own subscription (for usage tracking)
CREATE POLICY "Users can update own subscription"
  ON user_subscriptions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy for service role to manage all subscriptions
CREATE POLICY "Service role can manage all subscriptions"
  ON user_subscriptions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to initialize subscription for new users
CREATE OR REPLACE FUNCTION initialize_user_subscription()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_subscriptions (user_id, plan, status, document_limit, ai_questions_limit)
  VALUES (NEW.id, 'free', 'active', 5, 10)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create subscription on user signup
DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;
CREATE TRIGGER on_auth_user_created_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION initialize_user_subscription();

-- Function to reset AI questions counter monthly
CREATE OR REPLACE FUNCTION reset_ai_questions_counter()
RETURNS void AS $$
BEGIN
  UPDATE user_subscriptions
  SET 
    ai_questions_used = 0,
    ai_questions_reset_date = now() + interval '1 month',
    updated_at = now()
  WHERE ai_questions_reset_date <= now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_customer_id ON user_subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_subscription_id ON user_subscriptions(stripe_subscription_id);
