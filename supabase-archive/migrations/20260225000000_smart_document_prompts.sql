-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Smart Document Prompts — Schema                            ║
-- ╚══════════════════════════════════════════════════════════════╝

-- Detected Loans: loans/mortgages detected from transaction patterns
CREATE TABLE IF NOT EXISTS detected_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  loan_type text NOT NULL CHECK (loan_type IN ('mortgage', 'auto_loan', 'student_loan', 'personal_loan', 'other')),
  merchant_name text NOT NULL,
  display_name text NOT NULL,
  estimated_monthly_payment numeric(14,2) NOT NULL,
  frequency text NOT NULL DEFAULT 'monthly',
  confidence numeric(3,2) NOT NULL DEFAULT 0.50,
  first_seen_date date NOT NULL,
  last_payment_date date NOT NULL,
  payment_count int NOT NULL DEFAULT 0,
  category text,
  category_detailed text,
  dismissed boolean NOT NULL DEFAULT false,
  dismissed_at timestamptz,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, merchant_name, loan_type)
);

ALTER TABLE detected_loans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own detected loans" ON detected_loans;
CREATE POLICY "Users can manage their own detected loans"
  ON detected_loans FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_detected_loans_user ON detected_loans(user_id);
CREATE INDEX IF NOT EXISTS idx_detected_loans_active ON detected_loans(user_id) WHERE dismissed = false AND document_id IS NULL;

-- Loan Analyses: AI-generated payoff/refinancing analysis after document upload
CREATE TABLE IF NOT EXISTS loan_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  detected_loan_id uuid NOT NULL REFERENCES detected_loans(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  extracted_data jsonb NOT NULL DEFAULT '{}',
  analysis_text text,
  payoff_timeline jsonb,
  refinancing_analysis jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE loan_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own loan analyses" ON loan_analyses;
CREATE POLICY "Users can manage their own loan analyses"
  ON loan_analyses FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_loan_analyses_user ON loan_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_loan_analyses_loan ON loan_analyses(detected_loan_id);
