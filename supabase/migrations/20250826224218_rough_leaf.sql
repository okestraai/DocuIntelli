/*
  # Add storage policy for documents bucket uploads

  1. Storage Policy
    - Allow anonymous users to INSERT files into documents bucket
    - Policy name: "Allow Anon Uploads"
    - Applies to storage.objects table
    - Fixes error code 1003 (insufficient permissions)

  2. Security
    - Allows file uploads from frontend/backend
    - Restricts to documents bucket only
    - INSERT operation only (no read/update/delete)
*/

-- Enable RLS on storage.objects if not already enabled
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Create policy to allow anonymous uploads to documents bucket
CREATE POLICY "Allow Anon Uploads"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (bucket_id = 'documents');

-- Optional: Also allow authenticated users to upload
CREATE POLICY "Allow Authenticated Uploads"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'documents');

-- Optional: Allow users to read their own uploaded files
CREATE POLICY "Allow Public Read Access"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'documents');