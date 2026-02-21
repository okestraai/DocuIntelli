-- Add tag_generation_triggered column to documents table
-- This prevents duplicate tag generation attempts when embedding reaches 60%
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS tag_generation_triggered BOOLEAN DEFAULT FALSE;

-- Add index for efficient querying
CREATE INDEX IF NOT EXISTS idx_documents_tag_generation_triggered
ON documents(tag_generation_triggered)
WHERE tag_generation_triggered = FALSE;

-- Add comment explaining the column
COMMENT ON COLUMN documents.tag_generation_triggered IS 'Tracks whether tag generation has been triggered when embedding progress reached 60%. Prevents duplicate tag generation attempts.';
