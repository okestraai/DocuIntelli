/*
  # Add URL and Manual Content Support to Documents

  1. Changes to `documents` table
    - Add `source_type` column to distinguish between file, URL, and manual content sources
    - Add `source_url` column to store URLs for URL-based documents
    - Add `content_text` column to store manually pasted content
    - Make `file_path` nullable since URL/manual sources don't have files
    - Add check constraint to ensure proper data based on source_type

  2. Security
    - No RLS changes needed - existing policies still apply
    - Users can only access their own documents regardless of source type

  3. Notes
    - Existing documents will default to 'file' source_type
    - URL and manual content will go through the same chunking and embedding process
*/

-- Add source_type column to track where the document came from
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'source_type'
  ) THEN
    ALTER TABLE documents ADD COLUMN source_type TEXT DEFAULT 'file' NOT NULL;
  END IF;
END $$;

-- Add source_url column for URL-based documents
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'source_url'
  ) THEN
    ALTER TABLE documents ADD COLUMN source_url TEXT;
  END IF;
END $$;

-- Add content_text column for manually pasted content
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'content_text'
  ) THEN
    ALTER TABLE documents ADD COLUMN content_text TEXT;
  END IF;
END $$;

-- Make file_path nullable since URL/manual content won't have files
DO $$
BEGIN
  -- Drop the NOT NULL constraint if it exists
  ALTER TABLE documents ALTER COLUMN file_path DROP NOT NULL;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Add check constraint to ensure proper data based on source_type
DO $$
BEGIN
  -- Drop existing constraint if it exists
  ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_source_type_check;
  
  -- Add constraint to validate source_type values
  ALTER TABLE documents ADD CONSTRAINT documents_source_type_check 
    CHECK (source_type IN ('file', 'url', 'manual'));
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Add check constraint to ensure URL is provided for URL type
DO $$
BEGIN
  ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_url_required_check;
  
  ALTER TABLE documents ADD CONSTRAINT documents_url_required_check 
    CHECK (
      (source_type = 'url' AND source_url IS NOT NULL) OR
      (source_type != 'url')
    );
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Add check constraint to ensure content is provided for manual type
DO $$
BEGIN
  ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_content_required_check;
  
  ALTER TABLE documents ADD CONSTRAINT documents_content_required_check 
    CHECK (
      (source_type = 'manual' AND content_text IS NOT NULL) OR
      (source_type != 'manual')
    );
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Add check constraint to ensure file_path is provided for file type
DO $$
BEGIN
  ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_filepath_required_check;
  
  ALTER TABLE documents ADD CONSTRAINT documents_filepath_required_check 
    CHECK (
      (source_type = 'file' AND file_path IS NOT NULL) OR
      (source_type != 'file')
    );
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Create index on source_type for efficient filtering
CREATE INDEX IF NOT EXISTS idx_documents_source_type ON documents(source_type);

-- Create index on source_url for URL lookups
CREATE INDEX IF NOT EXISTS idx_documents_source_url ON documents(source_url) WHERE source_url IS NOT NULL;