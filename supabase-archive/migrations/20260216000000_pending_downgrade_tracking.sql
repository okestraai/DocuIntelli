-- Add pending downgrade tracking columns to user_subscriptions
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS pending_plan text;
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS documents_to_keep text[];
