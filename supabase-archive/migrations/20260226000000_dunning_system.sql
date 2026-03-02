-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Dunning System — Payment failure escalation & recovery    ║
-- ╚══════════════════════════════════════════════════════════════╝

-- 1. Add dunning columns to user_subscriptions
ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS payment_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dunning_step integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS restricted_at timestamptz,
  ADD COLUMN IF NOT EXISTS downgraded_at timestamptz,
  ADD COLUMN IF NOT EXISTS previous_plan text,
  ADD COLUMN IF NOT EXISTS deletion_scheduled_at timestamptz;

-- Constrain payment_status to known values
ALTER TABLE user_subscriptions
  DROP CONSTRAINT IF EXISTS chk_payment_status;
ALTER TABLE user_subscriptions
  ADD CONSTRAINT chk_payment_status
  CHECK (payment_status IN ('active', 'past_due', 'restricted', 'downgraded'));

-- Index for the dunning cron job to quickly find users in dunning
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_dunning
  ON user_subscriptions(payment_status, dunning_step)
  WHERE payment_status != 'active';

-- 2. Dunning log table — full audit trail
CREATE TABLE IF NOT EXISTS dunning_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step integer NOT NULL,
  action text NOT NULL,
  details jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dunning_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own dunning log" ON dunning_log;
CREATE POLICY "Users can view their own dunning log"
  ON dunning_log FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can insert (backend/cron only)
DROP POLICY IF EXISTS "Service role full access on dunning_log" ON dunning_log;
CREATE POLICY "Service role full access on dunning_log"
  ON dunning_log FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_dunning_log_user ON dunning_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dunning_log_action ON dunning_log(action, created_at DESC);

-- 3. Schedule dunning-escalation cron job (daily at 06:00 UTC)
-- Uses the existing trigger_cron_task() function from migration 20260216200000
SELECT cron.schedule(
  'cron-dunning-escalation',
  '0 6 * * *',
  $$SELECT trigger_cron_task('dunning-escalation')$$
);
