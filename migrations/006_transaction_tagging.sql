-- Migration 006: Transaction tagging, income labeling & auto-learning
-- Adds user-applied tags to transactions and income streams,
-- plus a learning rules table for auto-tagging future transactions.

-- 1. User-applied tags on individual transactions
CREATE TABLE IF NOT EXISTS transaction_tags (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  transaction_id TEXT NOT NULL,
  tag           TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, transaction_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_transaction_tags_user ON transaction_tags(user_id);
CREATE INDEX IF NOT EXISTS idx_transaction_tags_txn ON transaction_tags(user_id, transaction_id);

-- 2. User-applied labels on income streams (keyed by merchant_stem)
CREATE TABLE IF NOT EXISTS income_stream_tags (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  merchant_stem         TEXT NOT NULL,
  tag                   TEXT NOT NULL,
  is_auto_salary_override BOOLEAN DEFAULT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, merchant_stem, tag)
);

CREATE INDEX IF NOT EXISTS idx_income_stream_tags_user ON income_stream_tags(user_id, merchant_stem);

-- 3. Per-user merchant→tag learning rules for auto-tagging
CREATE TABLE IF NOT EXISTS tag_learning_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  merchant_stem TEXT NOT NULL,
  tag           TEXT NOT NULL,
  confidence    INT NOT NULL DEFAULT 1,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, merchant_stem, tag)
);

CREATE INDEX IF NOT EXISTS idx_tag_learning_rules_lookup ON tag_learning_rules(user_id, merchant_stem);
