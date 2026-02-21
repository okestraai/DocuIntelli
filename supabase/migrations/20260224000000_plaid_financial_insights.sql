-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Plaid Financial Insights — Schema                         ║
-- ╚══════════════════════════════════════════════════════════════╝

-- Plaid Items: one per bank connection
CREATE TABLE IF NOT EXISTS plaid_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  access_token text NOT NULL,
  institution_name text NOT NULL DEFAULT 'Unknown',
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, item_id)
);

ALTER TABLE plaid_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own plaid items" ON plaid_items;
CREATE POLICY "Users can manage their own plaid items"
  ON plaid_items FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Plaid Accounts: individual bank accounts within an item
CREATE TABLE IF NOT EXISTS plaid_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  account_id text NOT NULL,
  name text NOT NULL,
  official_name text,
  type text NOT NULL,
  subtype text,
  mask text,
  initial_balance numeric(14,2),
  currency text NOT NULL DEFAULT 'USD',
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, account_id)
);

ALTER TABLE plaid_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own plaid accounts" ON plaid_accounts;
CREATE POLICY "Users can manage their own plaid accounts"
  ON plaid_accounts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Plaid Transactions
CREATE TABLE IF NOT EXISTS plaid_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  transaction_id text NOT NULL,
  account_id text NOT NULL,
  amount numeric(14,2) NOT NULL,
  date date NOT NULL,
  name text NOT NULL,
  merchant_name text,
  category text,
  category_detailed text,
  pending boolean NOT NULL DEFAULT false,
  payment_channel text,
  currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, transaction_id)
);

ALTER TABLE plaid_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own plaid transactions" ON plaid_transactions;
CREATE POLICY "Users can manage their own plaid transactions"
  ON plaid_transactions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Financial Insights: cached AI-generated reports
CREATE TABLE IF NOT EXISTS financial_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_data jsonb NOT NULL DEFAULT '{}',
  ai_recommendations text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE financial_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own financial insights" ON financial_insights;
CREATE POLICY "Users can manage their own financial insights"
  ON financial_insights FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_financial_insights_user ON financial_insights(user_id);
CREATE INDEX IF NOT EXISTS idx_financial_insights_expires ON financial_insights(user_id, expires_at DESC);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_plaid_items_user ON plaid_items(user_id);
CREATE INDEX IF NOT EXISTS idx_plaid_accounts_user ON plaid_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_plaid_accounts_item ON plaid_accounts(item_id);
CREATE INDEX IF NOT EXISTS idx_plaid_transactions_user ON plaid_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_plaid_transactions_account ON plaid_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_plaid_transactions_date ON plaid_transactions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_plaid_transactions_category ON plaid_transactions(user_id, category);
