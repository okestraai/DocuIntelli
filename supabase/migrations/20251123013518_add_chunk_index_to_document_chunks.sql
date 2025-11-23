/*
  # Add chunk_index to document_chunks table

  1. Changes
    - Add `chunk_index` column to `document_chunks` table to track the order of chunks
    - Column type: integer
    - Not nullable with default value 0
    - This enables proper ordering and retrieval of document chunks

  2. Notes
    - Uses IF NOT EXISTS pattern to prevent errors if column already exists
    - Existing rows will have chunk_index set to 0
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'document_chunks' AND column_name = 'chunk_index'
  ) THEN
    ALTER TABLE document_chunks ADD COLUMN chunk_index integer NOT NULL DEFAULT 0;
  END IF;
END $$;