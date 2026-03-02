-- ============================================================================
-- Custom OTP signup table
-- Stores pending email verifications before user account creation.
-- Passwords are encrypted (AES-GCM), OTPs are hashed (SHA-256).
-- Only accessible via service_role (edge functions).
-- ============================================================================

CREATE TABLE IF NOT EXISTS signup_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  otp_hash text NOT NULL,
  password_encrypted text NOT NULL,
  password_iv text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  is_used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_signup_otps_email ON signup_otps(email);
CREATE INDEX IF NOT EXISTS idx_signup_otps_email_created ON signup_otps(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signup_otps_expires ON signup_otps(expires_at);

-- RLS: Only service_role can access (no anon, no authenticated user access)
ALTER TABLE signup_otps ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role manages signup otps"
    ON signup_otps FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Helper: check if an email already exists in auth.users (for edge functions)
CREATE OR REPLACE FUNCTION check_user_email_exists(check_email text)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM auth.users WHERE email = lower(check_email));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup function: delete expired/used rows to prevent unbounded growth
CREATE OR REPLACE FUNCTION cleanup_expired_signup_otps()
RETURNS void AS $$
BEGIN
  DELETE FROM signup_otps
  WHERE expires_at < now() - interval '2 hours'
     OR (is_used = true AND created_at < now() - interval '1 hour');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule hourly cleanup via pg_cron
SELECT cron.schedule(
  'cleanup-signup-otps',
  '0 * * * *',
  $$SELECT cleanup_expired_signup_otps()$$
);
