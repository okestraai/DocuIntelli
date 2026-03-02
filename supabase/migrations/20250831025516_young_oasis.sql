/*
  # Add storage policy for anonymous uploads

  1. New Policies
    - `Allow Anon Uploads` on `storage.objects`
      - Allows INSERT operations for anonymous users
      - Restricted to 'documents' bucket only
      - Prevents uploads to other buckets

  2. Security
    - Anonymous users can only upload to documents bucket
    - No access to other storage buckets
    - INSERT-only permission (no read/update/delete)
*/

-- Create RLS policy for anonymous uploads to documents bucket
CREATE POLICY "Allow Anon Uploads"
  ON storage.objects
  FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'documents');