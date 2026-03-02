-- ============================================================
-- Financial Goals + In-App Notifications
-- ============================================================

-- ── financial_goals ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS financial_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_type text NOT NULL CHECK (goal_type IN ('savings', 'spending_limit', 'debt_paydown', 'income_target', 'ad_hoc')),
  name text NOT NULL,
  description text,
  target_amount numeric(14,2) NOT NULL CHECK (target_amount > 0),
  current_amount numeric(14,2) NOT NULL DEFAULT 0,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  target_date date NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired')),
  period_type text CHECK (period_type IN ('monthly', 'weekly', 'yearly')),
  baseline_amount numeric(14,2),
  milestones_notified jsonb NOT NULL DEFAULT '{"50": false, "75": false, "100": false}',
  completed_at timestamptz,
  expired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE financial_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own financial goals"
  ON financial_goals FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_financial_goals_user ON financial_goals(user_id);
CREATE INDEX idx_financial_goals_active ON financial_goals(user_id) WHERE status = 'active';
CREATE INDEX idx_financial_goals_archived ON financial_goals(user_id) WHERE status IN ('completed', 'expired');

-- ── financial_goal_accounts (many-to-many junction) ─────────
CREATE TABLE IF NOT EXISTS financial_goal_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES financial_goals(id) ON DELETE CASCADE,
  account_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(goal_id, account_id)
);

ALTER TABLE financial_goal_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own goal account links"
  ON financial_goal_accounts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_goal_accounts_goal ON financial_goal_accounts(goal_id);
CREATE INDEX idx_goal_accounts_account ON financial_goal_accounts(account_id);

-- ── in_app_notifications ────────────────────────────────────
CREATE TABLE IF NOT EXISTS in_app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('goal_milestone', 'goal_completed', 'goal_expired', 'system')),
  title text NOT NULL,
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE in_app_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own in-app notifications"
  ON in_app_notifications FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_in_app_notifications_user ON in_app_notifications(user_id);
CREATE INDEX idx_in_app_notifications_unread ON in_app_notifications(user_id) WHERE read = false;
CREATE INDEX idx_in_app_notifications_created ON in_app_notifications(user_id, created_at DESC);
