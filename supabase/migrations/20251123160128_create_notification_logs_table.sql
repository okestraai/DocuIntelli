/*
  # Create notification_logs table
  
  ## Purpose
  Track email notifications sent to users about expiring documents
  
  ## New Table: `notification_logs`
  - `id` (uuid, primary key) - Unique identifier
  - `user_id` (uuid, foreign key) - References auth.users
  - `notification_type` (text) - Type of notification (expiration_reminder, etc.)
  - `document_ids` (jsonb) - Array of document IDs included in the notification
  - `sent_at` (timestamptz) - UTC timestamp when notification was sent
  - `email_sent` (boolean) - Whether email was successfully sent
  - `error_message` (text, nullable) - Error details if sending failed
  - `created_at` (timestamptz) - UTC timestamp of record creation
  
  ## Security
  - Enable RLS on notification_logs table
  - Users can only view their own notification logs
  - Only authenticated users can insert logs (via Edge Functions)
  
  ## Indexes
  - Index on user_id for faster queries
  - Index on sent_at for time-based filtering
  - Index on notification_type for filtering by type
*/

-- Create notification_logs table
CREATE TABLE IF NOT EXISTS notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type text NOT NULL CHECK (notification_type IN ('expiration_reminder', 'document_uploaded', 'document_expired')),
  document_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  sent_at timestamptz NOT NULL DEFAULT now(),
  email_sent boolean NOT NULL DEFAULT false,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add comments for documentation
COMMENT ON COLUMN notification_logs.sent_at IS 'UTC timestamp when notification was sent';
COMMENT ON COLUMN notification_logs.created_at IS 'UTC timestamp when record was created';
COMMENT ON TABLE notification_logs IS 'Tracks email notifications sent to users';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_notification_logs_user_id ON notification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_sent_at ON notification_logs(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_logs_type ON notification_logs(notification_type);

-- Enable RLS
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own notification logs"
  ON notification_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notification logs"
  ON notification_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
