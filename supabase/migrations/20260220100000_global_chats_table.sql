-- ============================================================================
-- Global cross-document chat history
--
-- Stores conversation messages from the Global Chat feature (Pro-only).
-- Similar to document_chats but not scoped to a single document.
-- The sources JSONB column tracks which documents each answer drew from.
-- ============================================================================

CREATE TABLE IF NOT EXISTS global_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  sources jsonb,  -- [{document_id, document_name, chunk_index, similarity}]
  mentioned_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE global_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own global chats"
  ON global_chats FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own global chats"
  ON global_chats FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_global_chats_user_created
  ON global_chats (user_id, created_at DESC);
