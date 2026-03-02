/*
  # Engagement Engine Schema Migration

  Adds tables and columns needed for the Time-Aware Engagement Engine:

  1. Document Enhancements:
     - last_reviewed_at, review_cadence_days, issuer, owner, effective_date
     - health_state computed snapshot column
     - insights_cache for optional LLM-extracted insights

  2. New Tables:
     - review_events: audit trail for document reviews
     - gap_dismissals: tracks dismissed gap suggestions
     - document_relationships: links related documents
     - preparedness_snapshots: weekly snapshots for trend tracking

  3. Security:
     - RLS enabled on all new tables
     - Users can only access their own data
*/

-- ============================================================================
-- 1. Add engagement columns to documents table
-- ============================================================================

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_cadence_days integer,
  ADD COLUMN IF NOT EXISTS issuer text,
  ADD COLUMN IF NOT EXISTS owner_name text,
  ADD COLUMN IF NOT EXISTS effective_date date,
  ADD COLUMN IF NOT EXISTS health_state text DEFAULT 'healthy' CHECK (health_state IN ('healthy', 'watch', 'risk', 'critical')),
  ADD COLUMN IF NOT EXISTS health_computed_at timestamptz,
  ADD COLUMN IF NOT EXISTS insights_cache jsonb;

-- Index for health state queries
CREATE INDEX IF NOT EXISTS idx_documents_health_state ON documents(user_id, health_state);
CREATE INDEX IF NOT EXISTS idx_documents_last_reviewed ON documents(user_id, last_reviewed_at);
CREATE INDEX IF NOT EXISTS idx_documents_review_cadence ON documents(user_id, review_cadence_days) WHERE review_cadence_days IS NOT NULL;

-- ============================================================================
-- 2. Create review_events table (audit trail)
-- ============================================================================

CREATE TABLE IF NOT EXISTS review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN (
    'reviewed', 'confirmed_expiration', 'updated_metadata',
    'linked_document', 'added_tags', 'set_cadence'
  )),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_events_document ON review_events(document_id);
CREATE INDEX IF NOT EXISTS idx_review_events_user ON review_events(user_id);
CREATE INDEX IF NOT EXISTS idx_review_events_created ON review_events(user_id, created_at DESC);

ALTER TABLE review_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own review events"
  ON review_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own review events"
  ON review_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role manages review events"
  ON review_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- 3. Create gap_dismissals table
-- ============================================================================

CREATE TABLE IF NOT EXISTS gap_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  suggestion_key text NOT NULL,
  source_category text NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  marked_as_uploaded boolean DEFAULT false,
  UNIQUE(user_id, suggestion_key)
);

CREATE INDEX IF NOT EXISTS idx_gap_dismissals_user ON gap_dismissals(user_id);

ALTER TABLE gap_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own gap dismissals"
  ON gap_dismissals FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own gap dismissals"
  ON gap_dismissals FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own gap dismissals"
  ON gap_dismissals FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role manages gap dismissals"
  ON gap_dismissals FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- 4. Create document_relationships table
-- ============================================================================

CREATE TABLE IF NOT EXISTS document_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  related_document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  relationship_type text DEFAULT 'related' CHECK (relationship_type IN ('related', 'supersedes', 'supplements', 'depends_on')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_document_id, related_document_id),
  CHECK (source_document_id != related_document_id)
);

CREATE INDEX IF NOT EXISTS idx_doc_relationships_source ON document_relationships(source_document_id);
CREATE INDEX IF NOT EXISTS idx_doc_relationships_related ON document_relationships(related_document_id);
CREATE INDEX IF NOT EXISTS idx_doc_relationships_user ON document_relationships(user_id);

ALTER TABLE document_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own document relationships"
  ON document_relationships FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own document relationships"
  ON document_relationships FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own document relationships"
  ON document_relationships FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages document relationships"
  ON document_relationships FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- 5. Create preparedness_snapshots table (for trend tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS preparedness_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score integer NOT NULL CHECK (score >= 0 AND score <= 100),
  factors jsonb NOT NULL DEFAULT '{}',
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_preparedness_user_date ON preparedness_snapshots(user_id, snapshot_date DESC);

ALTER TABLE preparedness_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own preparedness snapshots"
  ON preparedness_snapshots FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages preparedness snapshots"
  ON preparedness_snapshots FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- 6. Migration Complete
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Migration 20260212000000_engagement_engine completed successfully';
  RAISE NOTICE 'Added engagement columns to documents table';
  RAISE NOTICE 'Created review_events, gap_dismissals, document_relationships, preparedness_snapshots tables';
END $$;
