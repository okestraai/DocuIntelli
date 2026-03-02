/*
  # Life Events & Readiness Engine
  New tables: life_events, life_event_requirement_status,
  life_event_requirement_matches, doc_classifications
*/

-- 1. life_events
CREATE TABLE IF NOT EXISTS life_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  intake_answers JSONB NOT NULL DEFAULT '{}',
  readiness_score NUMERIC(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_life_events_user_id ON life_events(user_id);
CREATE INDEX IF NOT EXISTS idx_life_events_status ON life_events(status);
ALTER TABLE life_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own life events"
  ON life_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own life events"
  ON life_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own life events"
  ON life_events FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own life events"
  ON life_events FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Service role manages life events"
  ON life_events FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION update_life_events_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS update_life_events_updated_at ON life_events;
CREATE TRIGGER update_life_events_updated_at
  BEFORE UPDATE ON life_events FOR EACH ROW EXECUTE FUNCTION update_life_events_updated_at();

-- 2. life_event_requirement_status
CREATE TABLE IF NOT EXISTS life_event_requirement_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  life_event_id UUID NOT NULL REFERENCES life_events(id) ON DELETE CASCADE,
  requirement_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','satisfied','missing','needs_update','expiring_soon','incomplete_metadata','not_applicable')),
  not_applicable_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(life_event_id, requirement_id)
);
CREATE INDEX IF NOT EXISTS idx_le_req_status_event ON life_event_requirement_status(life_event_id);
ALTER TABLE life_event_requirement_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own req statuses" ON life_event_requirement_status FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM life_events le WHERE le.id = life_event_id AND le.user_id = auth.uid()));
CREATE POLICY "Users can insert own req statuses" ON life_event_requirement_status FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM life_events le WHERE le.id = life_event_id AND le.user_id = auth.uid()));
CREATE POLICY "Users can update own req statuses" ON life_event_requirement_status FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM life_events le WHERE le.id = life_event_id AND le.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM life_events le WHERE le.id = life_event_id AND le.user_id = auth.uid()));
CREATE POLICY "Users can delete own req statuses" ON life_event_requirement_status FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM life_events le WHERE le.id = life_event_id AND le.user_id = auth.uid()));
CREATE POLICY "Service role manages req statuses" ON life_event_requirement_status FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 3. life_event_requirement_matches
CREATE TABLE IF NOT EXISTS life_event_requirement_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  life_event_id UUID NOT NULL REFERENCES life_events(id) ON DELETE CASCADE,
  requirement_id TEXT NOT NULL,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.50,
  match_method TEXT NOT NULL DEFAULT 'deterministic'
    CHECK (match_method IN ('deterministic','heuristic','llm','manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(life_event_id, requirement_id, document_id)
);
CREATE INDEX IF NOT EXISTS idx_le_req_matches_event ON life_event_requirement_matches(life_event_id);
CREATE INDEX IF NOT EXISTS idx_le_req_matches_doc ON life_event_requirement_matches(document_id);
ALTER TABLE life_event_requirement_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own req matches" ON life_event_requirement_matches FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM life_events le WHERE le.id = life_event_id AND le.user_id = auth.uid()));
CREATE POLICY "Users can insert own req matches" ON life_event_requirement_matches FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM life_events le WHERE le.id = life_event_id AND le.user_id = auth.uid()));
CREATE POLICY "Users can update own req matches" ON life_event_requirement_matches FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM life_events le WHERE le.id = life_event_id AND le.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM life_events le WHERE le.id = life_event_id AND le.user_id = auth.uid()));
CREATE POLICY "Users can delete own req matches" ON life_event_requirement_matches FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM life_events le WHERE le.id = life_event_id AND le.user_id = auth.uid()));
CREATE POLICY "Service role manages req matches" ON life_event_requirement_matches FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 4. doc_classifications (LLM cache)
CREATE TABLE IF NOT EXISTS doc_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  classified_type TEXT NOT NULL,
  extracted_fields JSONB DEFAULT '{}',
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(document_id)
);
CREATE INDEX IF NOT EXISTS idx_doc_classifications_doc ON doc_classifications(document_id);
ALTER TABLE doc_classifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own doc classifications" ON doc_classifications FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM documents d WHERE d.id = document_id AND d.user_id = auth.uid()));
CREATE POLICY "Service role manages doc classifications" ON doc_classifications FOR ALL TO service_role
  USING (true) WITH CHECK (true);
