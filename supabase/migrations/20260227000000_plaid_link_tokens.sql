-- Persist Plaid link_token → user_id mapping for Hosted Link webhook flow.
-- The LINK/ITEM_ADD_RESULT webhook needs to look up which user owns a given link_token.
-- Previously stored in-memory (lost on server restart); now persisted in DB.

CREATE TABLE IF NOT EXISTS plaid_link_tokens (
  link_token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  used_at TIMESTAMPTZ  -- set when webhook successfully exchanges the token
);

-- RLS: only service_role accesses this table (backend uses service_role key)
ALTER TABLE plaid_link_tokens ENABLE ROW LEVEL SECURITY;

-- Auto-cleanup: delete tokens older than 4 hours (Plaid link tokens expire after 4h)
-- Runs daily at 1am UTC
SELECT cron.schedule(
  'cleanup-plaid-link-tokens',
  '0 1 * * *',
  $$DELETE FROM public.plaid_link_tokens WHERE created_at < NOW() - INTERVAL '4 hours'$$
);
