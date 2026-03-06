-- 009_metadata_extraction.sql
-- Add columns for LLM-extracted document metadata and confirmation tracking.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS policy_number TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS extracted_metadata JSONB;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS metadata_confirmed BOOLEAN DEFAULT FALSE;
