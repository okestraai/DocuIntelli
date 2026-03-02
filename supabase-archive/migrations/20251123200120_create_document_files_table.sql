/*
  # Add support for multiple files per document

  ## Overview
  Enables a single document to have multiple associated files (e.g., multi-part contracts).
  Each file is processed separately, with text extraction and chunking stored per file.

  ## New Tables
  
  ### `document_files`
  - `id` (uuid, primary key) - Unique identifier for each file
  - `document_id` (uuid, foreign key) - Parent document
  - `file_path` (text) - Storage path/key
  - `original_name` (text) - Original filename
  - `file_order` (integer) - Display order (1, 2, 3...)
  - `size` (bigint) - File size in bytes
  - `type` (text) - MIME type
  - `processed` (boolean) - Whether file has been processed for text extraction
  - `created_at` (timestamptz) - Creation timestamp

  ## Schema Changes
  
  ### `document_chunks` table
  - Add `file_id` (uuid, nullable, foreign key to document_files)
  - Allows chunks to reference specific file within a document
  - Nullable for backward compatibility with existing chunks

  ## Migration Strategy
  
  1. Create document_files table
  2. For existing documents, create corresponding document_files records
  3. Add file_id column to document_chunks
  4. Update existing chunks to reference their document's file
  
  ## Security
  
  ### RLS Policies for `document_files`
  - Users can view files for their own documents
  - Users can insert files for their own documents
  - Users can update files for their own documents
  - Users can delete files for their own documents

  ## Indexes
  - Index on document_files.document_id for faster lookups
  - Index on document_files.file_order for sorting
  - Index on document_chunks.file_id for filtering chunks by file

  ## Notes
  - Maintains backward compatibility with single-file documents
  - Cascading deletes ensure cleanup when documents are deleted
  - File order allows proper display of multi-part documents
*/

-- Create document_files table
CREATE TABLE IF NOT EXISTS document_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  original_name text NOT NULL,
  file_order integer NOT NULL DEFAULT 1,
  size bigint NOT NULL DEFAULT 0,
  type text NOT NULL DEFAULT 'application/pdf',
  processed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_document_files_document_id ON document_files(document_id);
CREATE INDEX IF NOT EXISTS idx_document_files_order ON document_files(document_id, file_order);

-- Enable RLS on document_files table
ALTER TABLE document_files ENABLE ROW LEVEL SECURITY;

-- RLS policies for document_files table
CREATE POLICY "Users can view files for own documents"
  ON document_files
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_files.document_id
      AND documents.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert files for own documents"
  ON document_files
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_files.document_id
      AND documents.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update files for own documents"
  ON document_files
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_files.document_id
      AND documents.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_files.document_id
      AND documents.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete files for own documents"
  ON document_files
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_files.document_id
      AND documents.user_id = auth.uid()
    )
  );

-- Migrate existing documents to document_files
-- For each existing document, create a corresponding file record
INSERT INTO document_files (document_id, file_path, original_name, file_order, size, type, processed, created_at)
SELECT 
  id as document_id,
  file_path,
  original_name,
  1 as file_order,
  CASE 
    WHEN size ~ '^\d+(\.\d+)?\s*(KB|MB|GB)$' THEN
      CASE 
        WHEN size LIKE '%KB' THEN (REPLACE(REPLACE(size, ' KB', ''), 'KB', '')::numeric * 1024)::bigint
        WHEN size LIKE '%MB' THEN (REPLACE(REPLACE(size, ' MB', ''), 'MB', '')::numeric * 1024 * 1024)::bigint
        WHEN size LIKE '%GB' THEN (REPLACE(REPLACE(size, ' GB', ''), 'GB', '')::numeric * 1024 * 1024 * 1024)::bigint
        ELSE 0
      END
    ELSE 0
  END as size,
  type,
  processed,
  created_at
FROM documents
WHERE NOT EXISTS (
  SELECT 1 FROM document_files 
  WHERE document_files.document_id = documents.id
);

-- Add file_id to document_chunks (nullable for backward compatibility)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'document_chunks' AND column_name = 'file_id'
  ) THEN
    ALTER TABLE document_chunks 
    ADD COLUMN file_id uuid REFERENCES document_files(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Update existing chunks to reference their document's file
UPDATE document_chunks dc
SET file_id = (
  SELECT df.id
  FROM document_files df
  WHERE df.document_id = dc.document_id
  AND df.file_order = 1
)
WHERE dc.file_id IS NULL;

-- Create index on file_id for better performance
CREATE INDEX IF NOT EXISTS idx_document_chunks_file_id ON document_chunks(file_id);
