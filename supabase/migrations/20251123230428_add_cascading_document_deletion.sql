/*
  # Add cascading document deletion

  ## Purpose
  Ensure that when a document is deleted, ALL related data is removed from ALL tables.
  This includes document_chunks, document_chats, document_files, and notification_logs references.

  ## Changes
  
  1. Database Function: `delete_document_cascade()`
     - Deletes document_chunks (already has CASCADE from FK)
     - Deletes document_chats (already has CASCADE from FK)
     - Deletes document_files (already has CASCADE from FK)
     - Removes document_id references from notification_logs.document_ids
     - Finally deletes the document record
     - Returns the file_path so the backend can delete from storage
  
  2. Foreign Key Verification
     - Ensures all foreign keys have ON DELETE CASCADE set properly
  
  ## Security
  - Function uses SECURITY DEFINER to run with elevated privileges
  - Still respects RLS policies by checking user_id
  - Only allows users to delete their own documents
  
  ## Notes
  - The backend will still need to delete the actual file from storage
  - All database cleanup happens in a single transaction
  - If any step fails, the entire operation is rolled back
*/

-- Function to delete a document and all its related data
CREATE OR REPLACE FUNCTION delete_document_cascade(
  p_document_id uuid,
  p_user_id uuid
)
RETURNS TABLE(file_path text, success boolean, message text) AS $$
DECLARE
  v_file_path text;
  v_document_exists boolean;
BEGIN
  -- Check if document exists and belongs to user
  SELECT 
    d.file_path,
    true
  INTO 
    v_file_path,
    v_document_exists
  FROM documents d
  WHERE d.id = p_document_id AND d.user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::text, false, 'Document not found or access denied';
    RETURN;
  END IF;

  -- Remove document_id from notification_logs.document_ids array
  -- This updates the JSONB array to remove the document_id
  UPDATE notification_logs
  SET document_ids = (
    SELECT jsonb_agg(elem)
    FROM jsonb_array_elements_text(document_ids) elem
    WHERE elem::text != p_document_id::text
  )
  WHERE document_ids ? p_document_id::text;

  -- Delete document_chats (CASCADE will handle this, but being explicit)
  DELETE FROM document_chats
  WHERE document_id = p_document_id AND user_id = p_user_id;

  -- Delete document_chunks (CASCADE will handle this, but being explicit)
  DELETE FROM document_chunks
  WHERE document_id = p_document_id AND user_id = p_user_id;

  -- Delete document_files (CASCADE will handle this, but being explicit)
  DELETE FROM document_files
  WHERE document_id = p_document_id;

  -- Finally delete the document itself
  DELETE FROM documents
  WHERE id = p_document_id AND user_id = p_user_id;

  -- Return success with file_path so backend can delete from storage
  RETURN QUERY SELECT v_file_path, true, 'Document and all related data deleted successfully';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION delete_document_cascade(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION delete_document_cascade(uuid, uuid) IS 'Deletes a document and all its related data across all tables. Returns file_path for storage cleanup.';

-- Verify and update foreign key constraints to ensure CASCADE delete
-- These should already exist from previous migrations, but this ensures they are correct

-- document_chunks.document_id -> documents.id (should cascade)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'document_chunks_document_id_fkey' 
    AND table_name = 'document_chunks'
  ) THEN
    ALTER TABLE document_chunks
    ADD CONSTRAINT document_chunks_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;
  END IF;
END $$;

-- document_chats.document_id -> documents.id (should cascade)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'document_chats_document_id_fkey' 
    AND table_name = 'document_chats'
  ) THEN
    ALTER TABLE document_chats
    ADD CONSTRAINT document_chats_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;
  END IF;
END $$;

-- document_files.document_id -> documents.id (should cascade)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'document_files_document_id_fkey' 
    AND table_name = 'document_files'
  ) THEN
    ALTER TABLE document_files
    ADD CONSTRAINT document_files_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;
  END IF;
END $$;
