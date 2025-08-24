/*
  # Full Setup: Documents + Storage + AI Chat Support

  This script creates:
  1. `documents` → metadata for uploaded files
  2. `document_chunks` → embeddings for semantic search
  3. `document_chats` → chat history per document
  4. Storage bucket for file uploads
  5. Row-Level Security (RLS) and policies to ensure users can only access their own data
*/

-----------------------------
-- 1. DOCUMENTS TABLE
-----------------------------
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  type text NOT NULL DEFAULT 'PDF',
  size text NOT NULL DEFAULT '0 KB',
  file_path text NOT NULL,
  original_name text NOT NULL,
  upload_date date NOT NULL DEFAULT CURRENT_DATE,
  expiration_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expiring', 'expired')),
  processed boolean NOT NULL DEFAULT false, -- true once embeddings are created
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own documents"
  ON documents FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own documents"
  ON documents FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own documents"
  ON documents FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents"
  ON documents FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS documents_user_id_idx ON documents(user_id);
CREATE INDEX IF NOT EXISTS documents_category_idx ON documents(category);
CREATE INDEX IF NOT EXISTS documents_status_idx ON documents(status);
CREATE INDEX IF NOT EXISTS documents_expiration_date_idx ON documents(expiration_date);
CREATE INDEX IF NOT EXISTS documents_created_at_idx ON documents(created_at DESC);

-----------------------------
-- 2. DOCUMENT CHUNKS (embeddings)
-----------------------------
CREATE TABLE IF NOT EXISTS document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  chunk_text text NOT NULL,
  embedding vector(1536), -- depends on model (e.g., OpenAI ada-002 = 1536)
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own document chunks"
  ON document_chunks FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own document chunks"
  ON document_chunks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own document chunks"
  ON document_chunks FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own document chunks"
  ON document_chunks FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Indexes for similarity search
CREATE INDEX IF NOT EXISTS idx_document_chunks_doc_id ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding
  ON document_chunks USING ivfflat (embedding vector_cosine_ops);

-----------------------------
-- 3. DOCUMENT CHATS (chat history)
-----------------------------
CREATE TABLE IF NOT EXISTS document_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  question text NOT NULL,
  answer text NOT NULL,
  sources jsonb, -- list of chunk IDs or references used
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE document_chats ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own document chats"
  ON document_chats FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own document chats"
  ON document_chats FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own document chats"
  ON document_chats FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Index
CREATE INDEX IF NOT EXISTS idx_document_chats_doc_id ON document_chats(document_id);

-----------------------------
-- 4. STORAGE BUCKET
-----------------------------
-- Create storage bucket for files
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on storage
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Storage RLS Policies
CREATE POLICY "Users can upload own documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view own documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own documents"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);
