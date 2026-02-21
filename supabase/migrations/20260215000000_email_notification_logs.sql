-- Email Notification Logs
-- Tracks all email notifications sent to users for auditing and deduplication.

-- Create table if not exists (may partially exist from expiration notifications)
CREATE TABLE IF NOT EXISTS notification_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  channel text NOT NULL DEFAULT 'email',
  recipient text,
  status text NOT NULL DEFAULT 'pending', -- pending, sent, failed, skipped
  message_id text,
  error_message text,
  metadata jsonb DEFAULT '{}',
  sent_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Add missing columns if table already existed
DO $$ BEGIN
  ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS channel text DEFAULT 'email';
  ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS recipient text;
  ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';
  ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS message_id text;
  ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS error_message text;
  ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';
EXCEPTION WHEN others THEN NULL;
END $$;

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_notification_logs_user_id ON notification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_type ON notification_logs(notification_type);
CREATE INDEX IF NOT EXISTS idx_notification_logs_sent_at ON notification_logs(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_logs_user_type ON notification_logs(user_id, notification_type, sent_at DESC);

-- RLS policies
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

-- Users can only view their own notification logs
DO $$ BEGIN
  CREATE POLICY "Users can view own notification logs"
    ON notification_logs FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role can insert/update (backend operations)
DO $$ BEGIN
  CREATE POLICY "Service role can manage notification logs"
    ON notification_logs FOR ALL
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
