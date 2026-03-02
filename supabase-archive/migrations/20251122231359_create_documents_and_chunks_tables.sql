/*
  # Create documents and document_chunks tables

  ## New Tables
  
  ### `documents`
  - `id` (uuid, primary key, auto-generated)
  - `user_id` (uuid, foreign key to auth.users)
  - `name` (text) - Display name for the document
  - `category` (text) - Document category (warranty, insurance, lease, employment, contract, other)
  - `type` (text) - MIME type of the file
  - `size` (bigint) - File size in bytes
  - `file_path` (text) - Path/key in IBM COS storage
  - `original_name` (text) - Original filename
  - `upload_date` (date) - Date when document was uploaded
  - `expiration_date` (date, nullable) - Optional expiration date
  - `status` (text) - Document status (active, expiring, expired)
  - `processed` (boolean) - Whether document has been processed for embeddings
  - `created_at` (timestamptz) - Timestamp of creation
  - `updated_at` (timestamptz) - Timestamp of last update

  ### `document_chunks`
  - `id` (uuid, primary key, auto-generated)
  - `document_id` (uuid, foreign key to documents)
  - `user_id` (uuid, foreign key to auth.users)
  - `chunk_text` (text) - The text chunk content
  - `embedding` (vector(1536)) - OpenAI embedding vector
  - `created_at` (timestamptz) - Timestamp of creation

  ## Security
  
  ### RLS Policies for `documents`
  - Users can only view their own documents
  - Users can only insert their own documents
  - Users can only update their own documents
  - Users can only delete their own documents

  ### RLS Policies for `document_chunks`
  - Users can only view their own document chunks
  - Users can only insert their own document chunks
  - Users can only delete their own document chunks

  ## Indexes
  - Index on documents.user_id for faster queries
  - Index on documents.status for filtering
  - Index on document_chunks.document_id for faster lookups
  - Index on document_chunks.user_id for faster queries
  - Vector similarity index on document_chunks.embedding for semantic search

  ## Notes
  - Uses pgvector extension for embedding storage and similarity search
  - All tables have RLS enabled for user data isolation
  - Foreign key constraints ensure referential integrity
  - Timestamps are automatically managed with triggers
*/

-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('warranty', 'insurance', 'lease', 'employment', 'contract', 'other')),
  type text NOT NULL,
  size bigint NOT NULL,
  file_path text NOT NULL,
  original_name text NOT NULL,
  upload_date date NOT NULL DEFAULT CURRENT_DATE,
  expiration_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expiring', 'expired')),
  processed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create document_chunks table
CREATE TABLE IF NOT EXISTS document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chunk_text text NOT NULL,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_user_id ON document_chunks(user_id);

-- Create vector similarity index for semantic search
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON document_chunks 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Enable RLS on documents table
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- RLS policies for documents table
CREATE POLICY "Users can view own documents"
  ON documents
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own documents"
  ON documents
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own documents"
  ON documents
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents"
  ON documents
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Enable RLS on document_chunks table
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

-- RLS policies for document_chunks table
CREATE POLICY "Users can view own document chunks"
  ON document_chunks
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own document chunks"
  ON document_chunks
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own document chunks"
  ON document_chunks
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on documents table
DROP TRIGGER IF EXISTS update_documents_updated_at ON documents;
CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_documents_updated_at();