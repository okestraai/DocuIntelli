/*
  # Fix document_chats table schema

  1. Changes
    - Drop the old document_chats table if it exists with wrong schema
    - Create new document_chats table with correct schema (role, content)
    
  2. Reason
    - The existing table has 'question' and 'answer' columns instead of 'role' and 'content'
    - Need to recreate with the correct schema for chat history
*/

-- Drop the existing table if it exists
DROP TABLE IF EXISTS document_chats CASCADE;

-- Create document_chats table with correct schema
CREATE TABLE document_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  sources jsonb,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE document_chats ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own chat messages
CREATE POLICY "Users can view own chat messages"
  ON document_chats
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own chat messages
CREATE POLICY "Users can insert own chat messages"
  ON document_chats
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Create index for efficient history queries
CREATE INDEX document_chats_user_document_idx 
ON document_chats (user_id, document_id, created_at DESC);

-- Create index for document_id lookups
CREATE INDEX document_chats_document_idx 
ON document_chats (document_id, created_at DESC);
