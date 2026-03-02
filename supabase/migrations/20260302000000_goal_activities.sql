-- ============================================================
-- Financial Goal Activities (manual activity logging)
-- ============================================================

CREATE TABLE IF NOT EXISTS financial_goal_activities (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id       uuid NOT NULL REFERENCES financial_goals(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount        numeric(14,2) NOT NULL CHECK (amount > 0),
  description   text,
  activity_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE financial_goal_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own goal activities"
  ON financial_goal_activities FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_goal_activities_goal ON financial_goal_activities(goal_id);
CREATE INDEX idx_goal_activities_user ON financial_goal_activities(user_id);
CREATE INDEX idx_goal_activities_date ON financial_goal_activities(goal_id, activity_date DESC);
