-- ============================================================
-- Multi-Device Sync: user_devices table + enforcement helpers
-- ============================================================

-- 1. Table
CREATE TABLE IF NOT EXISTS user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  device_name TEXT,
  platform TEXT NOT NULL DEFAULT 'unknown',
  user_agent TEXT,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(user_id, device_id)
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_last_active ON user_devices(last_active_at);
CREATE INDEX IF NOT EXISTS idx_user_devices_user_blocked ON user_devices(user_id, is_blocked);

-- 3. RLS
ALTER TABLE user_devices ENABLE ROW LEVEL SECURITY;

-- Users can read their own devices
CREATE POLICY user_devices_select_own ON user_devices
  FOR SELECT USING (auth.uid() = user_id);

-- Users can delete their own devices
CREATE POLICY user_devices_delete_own ON user_devices
  FOR DELETE USING (auth.uid() = user_id);

-- Service role can do everything (backend uses service_role key)
CREATE POLICY user_devices_service_all ON user_devices
  FOR ALL
  USING (current_setting('role') = 'service_role')
  WITH CHECK (current_setting('role') = 'service_role');

-- 4. Helper: get device limit for a plan
CREATE OR REPLACE FUNCTION get_device_limit(plan_name TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN CASE plan_name
    WHEN 'free' THEN 1
    WHEN 'starter' THEN 2
    WHEN 'pro' THEN 5
    ELSE 1
  END;
END;
$$;

-- 5. pg_cron: clean up devices inactive for 30+ days (daily at 04:00 UTC)
SELECT cron.schedule(
  'cleanup-stale-devices',
  '0 4 * * *',
  $$DELETE FROM public.user_devices WHERE last_active_at < NOW() - INTERVAL '30 days'$$
);
