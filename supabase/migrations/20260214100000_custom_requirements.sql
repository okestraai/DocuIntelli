-- Custom document requirements added by users to life events
CREATE TABLE IF NOT EXISTS life_event_custom_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  life_event_id uuid NOT NULL REFERENCES life_events(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text DEFAULT '',
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE life_event_custom_requirements ENABLE ROW LEVEL SECURITY;

-- Users can manage custom requirements on their own events
CREATE POLICY "Users can manage own custom requirements"
  ON life_event_custom_requirements
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM life_events le
      WHERE le.id = life_event_custom_requirements.life_event_id
      AND le.user_id = auth.uid()
    )
  );

-- Service role full access
CREATE POLICY "Service role full access to custom requirements"
  ON life_event_custom_requirements
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
