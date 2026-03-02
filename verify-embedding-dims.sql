-- Verify actual embedding dimensions in PostgreSQL
-- Run this in Supabase SQL Editor

SELECT
    id,
    vector_dims(embedding) as actual_dimensions,
    CASE
        WHEN embedding IS NULL THEN 'NULL'
        ELSE 'HAS_VALUE'
    END as has_embedding
FROM document_chunks
WHERE embedding IS NOT NULL
LIMIT 5;
