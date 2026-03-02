-- Fix embedding column to support 4096 dimensions for vLLM
-- This needs to be run in Supabase SQL Editor

-- Step 1: Drop the existing embedding column
ALTER TABLE document_chunks DROP COLUMN IF EXISTS embedding;

-- Step 2: Add embedding column with 4096 dimensions
ALTER TABLE document_chunks ADD COLUMN embedding vector(4096);

-- Step 3: Recreate the index for vector similarity search
DROP INDEX IF EXISTS document_chunks_embedding_idx;
CREATE INDEX document_chunks_embedding_idx ON document_chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Verify the change
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'document_chunks' AND column_name = 'embedding';
