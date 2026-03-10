-- 010_cloud_storage_integrations.sql
-- Cloud storage provider connections and document source tracking.

-- Table: connected_cloud_sources
-- Stores OAuth tokens for each user's cloud provider connections.
CREATE TABLE IF NOT EXISTS connected_cloud_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google_drive', 'dropbox', 'onedrive')),
  provider_email TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_cloud_sources_user_id ON connected_cloud_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_cloud_sources_provider ON connected_cloud_sources(provider);

-- Add source tracking columns to documents table
ALTER TABLE documents ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'upload'
  CHECK (source IN ('upload', 'google_drive', 'dropbox', 'onedrive'));
ALTER TABLE documents ADD COLUMN IF NOT EXISTS cloud_file_id TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS cloud_source_id UUID REFERENCES connected_cloud_sources(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_documents_source ON documents(source);
CREATE INDEX IF NOT EXISTS idx_documents_cloud_file_id ON documents(cloud_file_id);

-- Trigger for updated_at on connected_cloud_sources
CREATE OR REPLACE FUNCTION update_cloud_sources_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_cloud_sources_updated_at ON connected_cloud_sources;
CREATE TRIGGER update_cloud_sources_updated_at
  BEFORE UPDATE ON connected_cloud_sources
  FOR EACH ROW
  EXECUTE FUNCTION update_cloud_sources_updated_at();

-- Add 'cloud' to the source_type CHECK constraint (allows file_path to be NULL for cloud imports)
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_source_type_check;
ALTER TABLE documents ADD CONSTRAINT documents_source_type_check
  CHECK (source_type = ANY (ARRAY['file'::text, 'url'::text, 'manual'::text, 'cloud'::text]));
