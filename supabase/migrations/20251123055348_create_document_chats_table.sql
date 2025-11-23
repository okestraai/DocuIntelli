/*
  # Create document_chats table for conversation history

  1. New Tables
    - `document_chats`
      - `id` (uuid, primary key) - Unique identifier for each message
      - `user_id` (uuid, foreign key) - References auth.users
      - `document_id` (uuid, foreign key) - References documents table
      - `role` (text) - Message role: 'user' or 'assistant'
      - `content` (text) - Message content
      - `sources` (jsonb, nullable) - Source chunks used for assistant responses
      - `created_at` (timestamptz) - Message timestamp
      
  2. Security
    - Enable RLS on `document_chats` table
    - Users can only view their own chat messages
    - Users can only insert their own chat messages
    
  3. Indexes
    - Index on (user_id, document_id, created_at) for efficient history retrieval
*/

-- Create document_chats table
CREATE TABLE IF NOT EXISTS document_chats (
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
CREATE INDEX IF NOT EXISTS document_chats_user_document_idx 
ON document_chats (user_id, document_id, created_at DESC);

-- Create index for document_id lookups
CREATE INDEX IF NOT EXISTS document_chats_document_idx 
ON document_chats (document_id, created_at DESC);
