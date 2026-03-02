-- ============================================================================
-- Custom JWT Auth System — Database Tables
--
-- Replaces Supabase auth.users with a self-managed auth system.
-- auth_users stores credentials and provider info.
-- auth_refresh_tokens stores hashed refresh tokens for JWT rotation.
-- ============================================================================

-- Users table (replaces Supabase auth.users)
CREATE TABLE IF NOT EXISTS auth_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,  -- NULL for OAuth-only users
  email_confirmed BOOLEAN DEFAULT false,
  provider TEXT DEFAULT 'email',  -- 'email' | 'google'
  provider_id TEXT,  -- Google sub ID
  raw_user_meta_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Refresh tokens for JWT auth
CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_refresh_tokens_user_id ON auth_refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON auth_refresh_tokens(token_hash);
CREATE INDEX idx_auth_users_email ON auth_users(email);
CREATE INDEX idx_auth_users_provider ON auth_users(provider, provider_id);

-- Cleanup function: delete expired/revoked refresh tokens
CREATE OR REPLACE FUNCTION cleanup_expired_refresh_tokens()
RETURNS void AS $$
BEGIN
  DELETE FROM auth_refresh_tokens
  WHERE expires_at < NOW()
     OR (revoked = true AND created_at < NOW() - interval '1 day');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule daily cleanup via pg_cron
SELECT cron.schedule(
  'cleanup-refresh-tokens',
  '30 2 * * *',
  $$SELECT cleanup_expired_refresh_tokens()$$
);
