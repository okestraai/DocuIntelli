/*
  # Storage Policies for Document Management

  1. Storage Policies
    - Allow authenticated users to upload files to documents bucket
    - Allow users to read their own files
    - Allow users to delete their own files
    - Path-based security using user ID

  2. Security
    - Files are organized by user ID in storage paths
    - Users can only access files in their own directory
    - Anonymous uploads are allowed for the upload workflow
*/

-- Enable RLS on storage.objects if not already enabled
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to upload files to documents bucket
CREATE POLICY "Allow authenticated uploads to documents bucket"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy for anonymous uploads to documents bucket (for upload workflow)
CREATE POLICY "Allow anon uploads to documents bucket"
  ON storage.objects
  FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'documents');

-- Policy for users to read their own files
CREATE POLICY "Allow users to read own files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy for users to delete their own files
CREATE POLICY "Allow users to delete own files"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Create the documents bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;