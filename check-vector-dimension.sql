-- Check the exact dimension of the vector column
-- Run this in Supabase SQL Editor

SELECT
    a.attname AS column_name,
    t.typname AS data_type,
    a.atttypmod AS type_modifier,
    CASE
        WHEN t.typname = 'vector' THEN
            (a.atttypmod - 4) -- pgvector stores dimension as typmod - 4
        ELSE NULL
    END AS vector_dimension
FROM pg_attribute a
JOIN pg_type t ON a.atttypid = t.oid
JOIN pg_class c ON a.attrelid = c.oid
WHERE c.relname = 'document_chunks'
  AND a.attname = 'embedding'
  AND NOT a.attisdropped;
