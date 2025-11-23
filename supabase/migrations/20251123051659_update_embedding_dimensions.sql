/*
  # Update embedding dimensions for gte-small model

  1. Changes
    - Modify the `embedding` column in `document_chunks` table from vector(1536) to vector(384)
    - This matches the output dimensions of Supabase's gte-small embedding model
    
  2. Notes
    - gte-small produces 384-dimensional embeddings
    - Any existing embeddings with 1536 dimensions will be preserved but new embeddings will be 384 dimensions
    - This change is necessary to support the Supabase AI embedding model
*/

-- Update the embedding column to support 384 dimensions (gte-small model)
ALTER TABLE document_chunks 
ALTER COLUMN embedding TYPE vector(384);
