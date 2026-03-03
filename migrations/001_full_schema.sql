-- ============================================================
-- DocuIntelli: Consolidated Azure PostgreSQL Migration
-- Generated from supabase-archive/migrations/ (61 files)
-- Target: Azure Database for PostgreSQL Flexible Server 17
-- ============================================================

-- Required extensions (must be enabled in Azure Portal first via azure.extensions server parameter)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";


-- ────────────────────────────────────────────────────────────
-- From: 20250825171144_holy_morning.sql
-- ────────────────────────────────────────────────────────────

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY,  -- will reference auth_users(id) via FK added at bottom
  display_name text,
  bio text,
  email_notifications boolean DEFAULT true,
  document_reminders boolean DEFAULT true,
  security_alerts boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- NOTE: auth handled by application layer, not RLS

-- Function to handle updated_at
CREATE OR REPLACE FUNCTION update_user_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_user_profiles_updated_at();


-- ────────────────────────────────────────────────────────────
-- From: 20250831025516_young_oasis.sql
-- ────────────────────────────────────────────────────────────

-- SKIPPED: Supabase storage.objects RLS policies (not applicable to Azure)


-- ────────────────────────────────────────────────────────────
-- From: 20250831025912_polished_disk.sql
-- ────────────────────────────────────────────────────────────

-- SKIPPED: Supabase storage.objects RLS policies (not applicable to Azure)
-- NOTE: The match_document_chunks function from this file is superseded by later migrations


-- ────────────────────────────────────────────────────────────
-- From: 20251122231359_create_documents_and_chunks_tables.sql
-- ────────────────────────────────────────────────────────────

-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,  -- FK to auth_users added at bottom
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('warranty', 'insurance', 'lease', 'employment', 'contract', 'other')),
  type text NOT NULL,
  size bigint NOT NULL,
  file_path text,  -- nullable: URL/manual sources don't have files (updated in later migration)
  original_name text NOT NULL,
  upload_date date NOT NULL DEFAULT CURRENT_DATE,
  expiration_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expiring', 'expired')),
  processed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create document_chunks table
CREATE TABLE IF NOT EXISTS document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,  -- FK to auth_users added at bottom
  chunk_text text NOT NULL,
  embedding vector(4096),  -- final dimension from 20260211000000 migration
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_user_id ON document_chunks(user_id);

-- NOTE: auth handled by application layer, not RLS

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on documents table
DROP TRIGGER IF EXISTS update_documents_updated_at ON documents;
CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_documents_updated_at();


-- ────────────────────────────────────────────────────────────
-- From: 20251123013518_add_chunk_index_to_document_chunks.sql
-- ────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'document_chunks' AND column_name = 'chunk_index'
  ) THEN
    ALTER TABLE document_chunks ADD COLUMN chunk_index integer NOT NULL DEFAULT 0;
  END IF;
END $$;


-- ────────────────────────────────────────────────────────────
-- From: 20251123051659_update_embedding_dimensions.sql
-- ────────────────────────────────────────────────────────────

-- SKIPPED: Embedding dimension was changed to 384 here, then to 4096 in later migration.
-- The CREATE TABLE above already uses vector(4096).


-- ────────────────────────────────────────────────────────────
-- From: 20251123054301_create_match_document_chunks_function.sql
-- ────────────────────────────────────────────────────────────

-- NOTE: This function is superseded by 20260211000000 which uses vector(4096).
-- Keeping the final version only (see below).


-- ────────────────────────────────────────────────────────────
-- From: 20251123055348_create_document_chats_table.sql
-- ────────────────────────────────────────────────────────────

-- SKIPPED: This table is dropped and recreated in the next migration (20251123060127).


-- ────────────────────────────────────────────────────────────
-- From: 20251123060127_fix_document_chats_schema.sql
-- ────────────────────────────────────────────────────────────

-- Drop the existing table if it exists
DROP TABLE IF EXISTS document_chats CASCADE;

-- Create document_chats table with correct schema
CREATE TABLE document_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,  -- FK to auth_users added at bottom
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  sources jsonb,
  created_at timestamptz DEFAULT now()
);

-- NOTE: auth handled by application layer, not RLS

-- Create index for efficient history queries
CREATE INDEX document_chats_user_document_idx
ON document_chats (user_id, document_id, created_at DESC);

-- Create index for document_id lookups
CREATE INDEX document_chats_document_idx
ON document_chats (document_id, created_at DESC);


-- ────────────────────────────────────────────────────────────
-- From: 20251123155139_ensure_utc_timestamps.sql
-- ────────────────────────────────────────────────────────────

-- Verify PostgreSQL is using UTC timezone
DO $$
BEGIN
  IF (SELECT current_setting('timezone')) != 'UTC' THEN
    RAISE NOTICE 'Database timezone is not UTC. Current timezone: %', current_setting('timezone');
  ELSE
    RAISE NOTICE 'Database timezone is correctly set to UTC';
  END IF;
END $$;

-- Add comments to document UTC usage
COMMENT ON COLUMN documents.created_at IS 'UTC timestamp when document was created';
COMMENT ON COLUMN documents.updated_at IS 'UTC timestamp when document was last updated';
COMMENT ON COLUMN document_chunks.created_at IS 'UTC timestamp when chunk was created';
COMMENT ON COLUMN user_profiles.created_at IS 'UTC timestamp when profile was created';
COMMENT ON COLUMN user_profiles.updated_at IS 'UTC timestamp when profile was last updated';
COMMENT ON COLUMN document_chats.created_at IS 'UTC timestamp when chat message was created';


-- ────────────────────────────────────────────────────────────
-- From: 20251123160128_create_notification_logs_table.sql
-- ────────────────────────────────────────────────────────────

-- Create notification_logs table
CREATE TABLE IF NOT EXISTS notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,  -- FK to auth_users added at bottom
  notification_type text NOT NULL,
  document_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  sent_at timestamptz NOT NULL DEFAULT now(),
  email_sent boolean NOT NULL DEFAULT false,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add comments for documentation
COMMENT ON COLUMN notification_logs.sent_at IS 'UTC timestamp when notification was sent';
COMMENT ON COLUMN notification_logs.created_at IS 'UTC timestamp when record was created';
COMMENT ON TABLE notification_logs IS 'Tracks email notifications sent to users';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_notification_logs_user_id ON notification_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_sent_at ON notification_logs(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_logs_type ON notification_logs(notification_type);

-- NOTE: auth handled by application layer, not RLS


-- ────────────────────────────────────────────────────────────
-- From: 20251123200120_create_document_files_table.sql
-- ────────────────────────────────────────────────────────────

-- Create document_files table
CREATE TABLE IF NOT EXISTS document_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  original_name text NOT NULL,
  file_order integer NOT NULL DEFAULT 1,
  size bigint NOT NULL DEFAULT 0,
  type text NOT NULL DEFAULT 'application/pdf',
  processed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_document_files_document_id ON document_files(document_id);
CREATE INDEX IF NOT EXISTS idx_document_files_order ON document_files(document_id, file_order);

-- NOTE: auth handled by application layer, not RLS

-- Add file_id to document_chunks (nullable for backward compatibility)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'document_chunks' AND column_name = 'file_id'
  ) THEN
    ALTER TABLE document_chunks
    ADD COLUMN file_id uuid REFERENCES document_files(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create index on file_id for better performance
CREATE INDEX IF NOT EXISTS idx_document_chunks_file_id ON document_chunks(file_id);


-- ────────────────────────────────────────────────────────────
-- From: 20251123230359_add_auto_embedding_trigger.sql
-- ────────────────────────────────────────────────────────────

-- SKIPPED: trigger_embedding_generation() uses net.http_post (pg_net) — not applicable.
-- Embedding generation is handled by the application layer on Azure.

-- Keep the helper function (no pg_net dependency)
CREATE OR REPLACE FUNCTION generate_missing_embeddings()
RETURNS TABLE(document_id uuid, chunks_count bigint) AS $$
BEGIN
  RETURN QUERY
  SELECT dc.document_id, COUNT(*)::bigint as chunks_count
  FROM document_chunks dc
  WHERE dc.embedding IS NULL
    AND dc.chunk_text IS NOT NULL
    AND dc.chunk_text != ''
  GROUP BY dc.document_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

COMMENT ON FUNCTION generate_missing_embeddings() IS 'Returns a list of documents with chunks that need embeddings generated';


-- ────────────────────────────────────────────────────────────
-- From: 20251123230428_add_cascading_document_deletion.sql
-- ────────────────────────────────────────────────────────────

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
  UPDATE notification_logs
  SET document_ids = (
    SELECT jsonb_agg(elem)
    FROM jsonb_array_elements_text(document_ids) elem
    WHERE elem::text != p_document_id::text
  )
  WHERE document_ids ? p_document_id::text;

  -- Delete document_chats
  DELETE FROM document_chats
  WHERE document_id = p_document_id AND user_id = p_user_id;

  -- Delete document_chunks
  DELETE FROM document_chunks
  WHERE document_id = p_document_id AND user_id = p_user_id;

  -- Delete document_files
  DELETE FROM document_files
  WHERE document_id = p_document_id;

  -- Finally delete the document itself
  DELETE FROM documents
  WHERE id = p_document_id AND user_id = p_user_id;

  -- Return success with file_path so backend can delete from storage
  RETURN QUERY SELECT v_file_path, true, 'Document and all related data deleted successfully';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

COMMENT ON FUNCTION delete_document_cascade(uuid, uuid) IS 'Deletes a document and all its related data across all tables. Returns file_path for storage cleanup.';

-- Verify and update foreign key constraints to ensure CASCADE delete
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


-- ────────────────────────────────────────────────────────────
-- From: 20251123230555_setup_automatic_embedding_processing.sql
-- ────────────────────────────────────────────────────────────

-- SKIPPED: Contains net.http_post calls and Supabase vault references.
-- Embedding processing is handled by the application layer on Azure.

-- Create a custom schema for app configuration if it doesn't exist
CREATE SCHEMA IF NOT EXISTS app_config;

-- Create a table to store configuration
CREATE TABLE IF NOT EXISTS app_config.settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);


-- ────────────────────────────────────────────────────────────
-- From: 20251125035033_enable_pg_net_and_fix_trigger.sql
-- ────────────────────────────────────────────────────────────

-- SKIPPED: pg_net extension setup — not available on Azure PostgreSQL.


-- ────────────────────────────────────────────────────────────
-- From: 20251125035100_fix_trigger_to_use_env_vars.sql
-- ────────────────────────────────────────────────────────────

-- SKIPPED: trigger_embedding_generation() uses net.http_post — not applicable.


-- ────────────────────────────────────────────────────────────
-- From: 20251125041011_fix_auto_embedding_trigger.sql
-- ────────────────────────────────────────────────────────────

-- SKIPPED: trigger_embedding_generation() and process_null_embeddings() use net.http_post — not applicable.


-- ────────────────────────────────────────────────────────────
-- From: 20251125044037_setup_scheduled_embedding_processor.sql
-- ────────────────────────────────────────────────────────────

-- SKIPPED: trigger_scheduled_embedding_processor() uses net.http_post — not applicable.


-- ────────────────────────────────────────────────────────────
-- From: 20251125044051_enable_pg_cron_and_schedule_embeddings.sql
-- ────────────────────────────────────────────────────────────

-- SKIPPED: cron.schedule() calls — node-cron handles scheduling on Azure.


-- ────────────────────────────────────────────────────────────
-- From: 20251125225906_add_tags_to_documents.sql
-- ────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'tags'
  ) THEN
    ALTER TABLE documents ADD COLUMN tags text[] DEFAULT '{}';
  END IF;
END $$;


-- ────────────────────────────────────────────────────────────
-- From: 20260117150917_add_url_and_manual_content_support.sql
-- ────────────────────────────────────────────────────────────

-- Add source_type column to track where the document came from
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'source_type'
  ) THEN
    ALTER TABLE documents ADD COLUMN source_type TEXT DEFAULT 'file' NOT NULL;
  END IF;
END $$;

-- Add source_url column for URL-based documents
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'source_url'
  ) THEN
    ALTER TABLE documents ADD COLUMN source_url TEXT;
  END IF;
END $$;

-- Add content_text column for manually pasted content
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents' AND column_name = 'content_text'
  ) THEN
    ALTER TABLE documents ADD COLUMN content_text TEXT;
  END IF;
END $$;

-- Make file_path nullable since URL/manual content won't have files
DO $$
BEGIN
  ALTER TABLE documents ALTER COLUMN file_path DROP NOT NULL;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Add check constraint to validate source_type values
DO $$
BEGIN
  ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_source_type_check;
  ALTER TABLE documents ADD CONSTRAINT documents_source_type_check
    CHECK (source_type IN ('file', 'url', 'manual'));
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Add check constraint to ensure URL is provided for URL type
DO $$
BEGIN
  ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_url_required_check;
  ALTER TABLE documents ADD CONSTRAINT documents_url_required_check
    CHECK (
      (source_type = 'url' AND source_url IS NOT NULL) OR
      (source_type != 'url')
    );
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Add check constraint to ensure content is provided for manual type
DO $$
BEGIN
  ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_content_required_check;
  ALTER TABLE documents ADD CONSTRAINT documents_content_required_check
    CHECK (
      (source_type = 'manual' AND content_text IS NOT NULL) OR
      (source_type != 'manual')
    );
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Add check constraint to ensure file_path is provided for file type
DO $$
BEGIN
  ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_filepath_required_check;
  ALTER TABLE documents ADD CONSTRAINT documents_filepath_required_check
    CHECK (
      (source_type = 'file' AND file_path IS NOT NULL) OR
      (source_type != 'file')
    );
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Create index on source_type for efficient filtering
CREATE INDEX IF NOT EXISTS idx_documents_source_type ON documents(source_type);

-- Create index on source_url for URL lookups
CREATE INDEX IF NOT EXISTS idx_documents_source_url ON documents(source_url) WHERE source_url IS NOT NULL;


-- ────────────────────────────────────────────────────────────
-- From: 20260117175401_silent_butterfly.sql
-- ────────────────────────────────────────────────────────────

-- Stripe Integration Schema

CREATE TYPE stripe_subscription_status AS ENUM (
    'not_started',
    'incomplete',
    'incomplete_expired',
    'trialing',
    'active',
    'past_due',
    'canceled',
    'unpaid',
    'paused'
);

CREATE TYPE stripe_order_status AS ENUM (
    'pending',
    'completed',
    'canceled'
);

CREATE TABLE IF NOT EXISTS stripe_customers (
  id bigint primary key generated always as identity,
  user_id uuid not null unique,  -- FK to auth_users added at bottom
  customer_id text not null unique,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  deleted_at timestamp with time zone default null
);

-- NOTE: auth handled by application layer, not RLS

CREATE TABLE IF NOT EXISTS stripe_subscriptions (
  id bigint primary key generated always as identity,
  customer_id text unique not null,
  subscription_id text default null,
  price_id text default null,
  current_period_start bigint default null,
  current_period_end bigint default null,
  cancel_at_period_end boolean default false,
  payment_method_brand text default null,
  payment_method_last4 text default null,
  status stripe_subscription_status not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  deleted_at timestamp with time zone default null
);

-- NOTE: auth handled by application layer, not RLS

CREATE TABLE IF NOT EXISTS stripe_orders (
    id bigint primary key generated always as identity,
    checkout_session_id text not null,
    payment_intent_id text not null,
    customer_id text not null,
    amount_subtotal bigint not null,
    amount_total bigint not null,
    currency text not null,
    payment_status text not null,
    status stripe_order_status not null default 'pending',
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    deleted_at timestamp with time zone default null
);

-- NOTE: auth handled by application layer, not RLS
-- NOTE: stripe_user_subscriptions and stripe_user_orders views that used auth.uid() are skipped


-- ────────────────────────────────────────────────────────────
-- From: 20260117175415_flat_water.sql
-- ────────────────────────────────────────────────────────────

-- SKIPPED: Duplicate of 20260117175401_silent_butterfly.sql (same schema)


-- ────────────────────────────────────────────────────────────
-- From: 20260117175726_create_user_subscriptions_table.sql
-- ────────────────────────────────────────────────────────────

-- Create user_subscriptions table
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,  -- FK to auth_users added at bottom
  plan text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'active',
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  document_limit integer NOT NULL DEFAULT 3,
  ai_questions_limit integer NOT NULL DEFAULT 5,
  ai_questions_used integer NOT NULL DEFAULT 0,
  ai_questions_reset_date timestamptz NOT NULL DEFAULT now() + interval '1 month',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- NOTE: auth handled by application layer, not RLS

-- Function to reset AI questions counter monthly
CREATE OR REPLACE FUNCTION reset_ai_questions_counter()
RETURNS void AS $$
BEGIN
  UPDATE user_subscriptions
  SET
    ai_questions_used = 0,
    ai_questions_reset_date = now() + interval '1 month',
    updated_at = now()
  WHERE ai_questions_reset_date <= now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_customer_id ON user_subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_subscription_id ON user_subscriptions(stripe_subscription_id);


-- ────────────────────────────────────────────────────────────
-- From: 20260117181955_update_subscription_limits.sql
-- ────────────────────────────────────────────────────────────

-- Drop and recreate the CHECK constraint to include 'starter' plan
ALTER TABLE user_subscriptions DROP CONSTRAINT IF EXISTS user_subscriptions_plan_check;
ALTER TABLE user_subscriptions
  ADD CONSTRAINT user_subscriptions_plan_check
  CHECK (plan IN ('free', 'starter', 'pro', 'business'));

-- Update default values for free plan
ALTER TABLE user_subscriptions
  ALTER COLUMN document_limit SET DEFAULT 3;

ALTER TABLE user_subscriptions
  ALTER COLUMN ai_questions_limit SET DEFAULT 5;


-- ────────────────────────────────────────────────────────────
-- From: 20260211000000_update_to_4096_dimensions.sql
-- ────────────────────────────────────────────────────────────

-- NOTE: The document_chunks table was already created with vector(4096) above.
-- This section creates the final version of match_document_chunks and indexes.

-- Drop existing indexes that depend on the embedding column
DROP INDEX IF EXISTS document_chunks_embedding_idx;
DROP INDEX IF EXISTS idx_document_chunks_embedding;

-- NOTE: Vector index skipped — Azure pgvector limits indexes to 2000 dimensions.
-- Our embeddings are 4096 dims, so we use sequential scan (brute-force cosine distance).
-- This is fine for moderate dataset sizes. When Azure updates pgvector, add:
-- CREATE INDEX document_chunks_embedding_idx ON document_chunks USING hnsw (embedding vector_cosine_ops);

-- Create the match function with 4096-dimensional embeddings (final version)
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector(4096),
  match_document_id uuid,
  match_count int DEFAULT 5,
  similarity_threshold float DEFAULT 0.3
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  chunk_index int,
  chunk_text text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.chunk_index,
    dc.chunk_text,
    1 - (dc.embedding <=> query_embedding) as similarity
  FROM document_chunks dc
  WHERE
    dc.document_id = match_document_id
    AND dc.embedding IS NOT NULL
    AND 1 - (dc.embedding <=> query_embedding) >= similarity_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Add comment to track migration
COMMENT ON COLUMN document_chunks.embedding IS
  'Vector embedding generated by e5-mistral-7b-instruct (4096 dimensions). Updated on 2026-02-11.';

-- Create a composite index for document_id + embedding searches
CREATE INDEX IF NOT EXISTS document_chunks_document_embedding_idx
ON document_chunks (document_id)
WHERE embedding IS NOT NULL;


-- ────────────────────────────────────────────────────────────
-- From: 20260211200000_create_billing_data_schema.sql
-- ────────────────────────────────────────────────────────────

-- Create payment_methods table
CREATE TABLE IF NOT EXISTS payment_methods (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id uuid NOT NULL,  -- FK to auth_users added at bottom
  payment_method_id text NOT NULL UNIQUE,
  customer_id text NOT NULL,
  type text NOT NULL DEFAULT 'card',
  brand text,
  name_on_card text,
  last4 text,
  exp_month integer,
  exp_year integer,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

-- Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id uuid NOT NULL,  -- FK to auth_users added at bottom
  invoice_id text NOT NULL UNIQUE,
  customer_id text NOT NULL,
  subscription_id text,
  invoice_number text,
  status text NOT NULL,
  amount_due bigint NOT NULL,
  amount_paid bigint NOT NULL,
  amount_remaining bigint NOT NULL,
  subtotal bigint NOT NULL,
  tax bigint DEFAULT 0,
  total bigint NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  invoice_pdf text,
  hosted_invoice_url text,
  billing_reason text,
  due_date timestamptz,
  paid_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id uuid NOT NULL,  -- FK to auth_users added at bottom
  transaction_id text NOT NULL UNIQUE,
  customer_id text NOT NULL,
  invoice_id text,
  charge_id text,
  payment_intent_id text,
  amount bigint NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL,
  description text,
  receipt_url text,
  payment_method_id text,
  payment_method_brand text,
  payment_method_last4 text,
  refunded boolean DEFAULT false,
  refund_amount bigint DEFAULT 0,
  failure_code text,
  failure_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

-- NOTE: auth handled by application layer, not RLS

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_payment_methods_user_id ON payment_methods(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payment_methods_customer_id ON payment_methods(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payment_methods_is_default ON payment_methods(user_id, is_default) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(user_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(user_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_customer_id ON transactions(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(user_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(user_id, created_at DESC) WHERE deleted_at IS NULL;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_billing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_payment_methods_updated_at
  BEFORE UPDATE ON payment_methods
  FOR EACH ROW
  EXECUTE FUNCTION update_billing_updated_at();

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_billing_updated_at();

CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_billing_updated_at();


-- ────────────────────────────────────────────────────────────
-- From: 20260212000000_engagement_engine.sql
-- ────────────────────────────────────────────────────────────

-- Add engagement columns to documents table
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_cadence_days integer,
  ADD COLUMN IF NOT EXISTS issuer text,
  ADD COLUMN IF NOT EXISTS owner_name text,
  ADD COLUMN IF NOT EXISTS effective_date date,
  ADD COLUMN IF NOT EXISTS health_state text DEFAULT 'healthy' CHECK (health_state IN ('healthy', 'watch', 'risk', 'critical')),
  ADD COLUMN IF NOT EXISTS health_computed_at timestamptz,
  ADD COLUMN IF NOT EXISTS insights_cache jsonb;

-- Index for health state queries
CREATE INDEX IF NOT EXISTS idx_documents_health_state ON documents(user_id, health_state);
CREATE INDEX IF NOT EXISTS idx_documents_last_reviewed ON documents(user_id, last_reviewed_at);
CREATE INDEX IF NOT EXISTS idx_documents_review_cadence ON documents(user_id, review_cadence_days) WHERE review_cadence_days IS NOT NULL;

-- Create review_events table (audit trail)
CREATE TABLE IF NOT EXISTS review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,  -- FK to auth_users added at bottom
  action text NOT NULL CHECK (action IN (
    'reviewed', 'confirmed_expiration', 'updated_metadata',
    'linked_document', 'added_tags', 'set_cadence'
  )),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_events_document ON review_events(document_id);
CREATE INDEX IF NOT EXISTS idx_review_events_user ON review_events(user_id);
CREATE INDEX IF NOT EXISTS idx_review_events_created ON review_events(user_id, created_at DESC);

-- NOTE: auth handled by application layer, not RLS

-- Create gap_dismissals table
CREATE TABLE IF NOT EXISTS gap_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,  -- FK to auth_users added at bottom
  suggestion_key text NOT NULL,
  source_category text NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  marked_as_uploaded boolean DEFAULT false,
  UNIQUE(user_id, suggestion_key)
);

CREATE INDEX IF NOT EXISTS idx_gap_dismissals_user ON gap_dismissals(user_id);

-- NOTE: auth handled by application layer, not RLS

-- Create document_relationships table
CREATE TABLE IF NOT EXISTS document_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,  -- FK to auth_users added at bottom
  source_document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  related_document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  relationship_type text DEFAULT 'related' CHECK (relationship_type IN ('related', 'supersedes', 'supplements', 'depends_on')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_document_id, related_document_id),
  CHECK (source_document_id != related_document_id)
);

CREATE INDEX IF NOT EXISTS idx_doc_relationships_source ON document_relationships(source_document_id);
CREATE INDEX IF NOT EXISTS idx_doc_relationships_related ON document_relationships(related_document_id);
CREATE INDEX IF NOT EXISTS idx_doc_relationships_user ON document_relationships(user_id);

-- NOTE: auth handled by application layer, not RLS

-- Create preparedness_snapshots table (for trend tracking)
CREATE TABLE IF NOT EXISTS preparedness_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,  -- FK to auth_users added at bottom
  score integer NOT NULL CHECK (score >= 0 AND score <= 100),
  factors jsonb NOT NULL DEFAULT '{}',
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_preparedness_user_date ON preparedness_snapshots(user_id, snapshot_date DESC);

-- NOTE: auth handled by application layer, not RLS


-- ────────────────────────────────────────────────────────────
-- From: 001_tier_enforcement.sql
-- ────────────────────────────────────────────────────────────

-- Add feature_flags column to user_subscriptions
ALTER TABLE user_subscriptions
ADD COLUMN IF NOT EXISTS feature_flags JSONB DEFAULT '{}';

-- Update default limits for free tier
ALTER TABLE user_subscriptions
  ALTER COLUMN document_limit SET DEFAULT 3,
  ALTER COLUMN ai_questions_limit SET DEFAULT 5;

-- Create usage_logs table for analytics
CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,  -- FK to auth_users added at bottom
  feature TEXT NOT NULL,
  metadata JSONB,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_timestamp ON usage_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_usage_logs_feature ON usage_logs(feature);

-- NOTE: auth handled by application layer, not RLS

-- Create limit_violations table for monitoring
CREATE TABLE IF NOT EXISTS limit_violations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,  -- FK to auth_users added at bottom
  limit_type TEXT NOT NULL,
  current_value INTEGER,
  limit_value INTEGER,
  metadata JSONB,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_limit_violations_user_id ON limit_violations(user_id);
CREATE INDEX IF NOT EXISTS idx_limit_violations_timestamp ON limit_violations(timestamp);
CREATE INDEX IF NOT EXISTS idx_limit_violations_type ON limit_violations(limit_type);

-- NOTE: auth handled by application layer, not RLS

-- Create helper function to check document limit
CREATE OR REPLACE FUNCTION check_document_limit(p_user_id UUID)
RETURNS TABLE(
  can_upload BOOLEAN,
  current_count INTEGER,
  limit_count INTEGER,
  plan TEXT
) AS $$
DECLARE
  v_subscription RECORD;
  v_doc_count INTEGER;
BEGIN
  SELECT * INTO v_subscription
  FROM user_subscriptions
  WHERE user_id = p_user_id;

  SELECT COUNT(*) INTO v_doc_count
  FROM documents
  WHERE user_id = p_user_id;

  RETURN QUERY SELECT
    v_doc_count < v_subscription.document_limit AS can_upload,
    v_doc_count AS current_count,
    v_subscription.document_limit AS limit_count,
    v_subscription.plan AS plan;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- Create helper function to check AI question limit
CREATE OR REPLACE FUNCTION check_ai_question_limit(p_user_id UUID)
RETURNS TABLE(
  can_ask BOOLEAN,
  current_count INTEGER,
  limit_count INTEGER,
  plan TEXT
) AS $$
DECLARE
  v_subscription RECORD;
BEGIN
  SELECT * INTO v_subscription
  FROM user_subscriptions
  WHERE user_id = p_user_id;

  IF v_subscription.plan != 'free' THEN
    RETURN QUERY SELECT
      true AS can_ask,
      v_subscription.ai_questions_used AS current_count,
      v_subscription.ai_questions_limit AS limit_count,
      v_subscription.plan AS plan;
  ELSE
    RETURN QUERY SELECT
      v_subscription.ai_questions_used < v_subscription.ai_questions_limit AS can_ask,
      v_subscription.ai_questions_used AS current_count,
      v_subscription.ai_questions_limit AS limit_count,
      v_subscription.plan AS plan;
  END IF;
END;
$$ LANGUAGE plpgsql
SET search_path = public;


-- ────────────────────────────────────────────────────────────
-- From: 20260213000000_add_tag_generation_trigger_flag.sql
-- ────────────────────────────────────────────────────────────

-- Add tag_generation_triggered column to documents table
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS tag_generation_triggered BOOLEAN DEFAULT FALSE;

-- Add index for efficient querying
CREATE INDEX IF NOT EXISTS idx_documents_tag_generation_triggered
ON documents(tag_generation_triggered)
WHERE tag_generation_triggered = FALSE;

COMMENT ON COLUMN documents.tag_generation_triggered IS 'Tracks whether tag generation has been triggered when embedding progress reached 60%. Prevents duplicate tag generation attempts.';


-- ────────────────────────────────────────────────────────────
-- From: 20260214000000_life_events.sql
-- ────────────────────────────────────────────────────────────

-- life_events
CREATE TABLE IF NOT EXISTS life_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,  -- FK to auth_users added at bottom
  template_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  intake_answers JSONB NOT NULL DEFAULT '{}',
  readiness_score NUMERIC(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_life_events_user_id ON life_events(user_id);
CREATE INDEX IF NOT EXISTS idx_life_events_status ON life_events(status);

-- NOTE: auth handled by application layer, not RLS

CREATE OR REPLACE FUNCTION update_life_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

DROP TRIGGER IF EXISTS update_life_events_updated_at ON life_events;
CREATE TRIGGER update_life_events_updated_at
  BEFORE UPDATE ON life_events FOR EACH ROW EXECUTE FUNCTION update_life_events_updated_at();

-- life_event_requirement_status
CREATE TABLE IF NOT EXISTS life_event_requirement_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  life_event_id UUID NOT NULL REFERENCES life_events(id) ON DELETE CASCADE,
  requirement_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','satisfied','missing','needs_update','expiring_soon','incomplete_metadata','not_applicable')),
  not_applicable_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(life_event_id, requirement_id)
);
CREATE INDEX IF NOT EXISTS idx_le_req_status_event ON life_event_requirement_status(life_event_id);

-- NOTE: auth handled by application layer, not RLS

-- life_event_requirement_matches
CREATE TABLE IF NOT EXISTS life_event_requirement_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  life_event_id UUID NOT NULL REFERENCES life_events(id) ON DELETE CASCADE,
  requirement_id TEXT NOT NULL,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.50,
  match_method TEXT NOT NULL DEFAULT 'deterministic'
    CHECK (match_method IN ('deterministic','heuristic','llm','manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(life_event_id, requirement_id, document_id)
);
CREATE INDEX IF NOT EXISTS idx_le_req_matches_event ON life_event_requirement_matches(life_event_id);
CREATE INDEX IF NOT EXISTS idx_le_req_matches_doc ON life_event_requirement_matches(document_id);

-- NOTE: auth handled by application layer, not RLS

-- doc_classifications (LLM cache)
CREATE TABLE IF NOT EXISTS doc_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  classified_type TEXT NOT NULL,
  extracted_fields JSONB DEFAULT '{}',
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(document_id)
);
CREATE INDEX IF NOT EXISTS idx_doc_classifications_doc ON doc_classifications(document_id);

-- NOTE: auth handled by application layer, not RLS


-- ────────────────────────────────────────────────────────────
-- From: 20260214100000_custom_requirements.sql
-- ────────────────────────────────────────────────────────────

-- Custom document requirements added by users to life events
CREATE TABLE IF NOT EXISTS life_event_custom_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  life_event_id uuid NOT NULL REFERENCES life_events(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text DEFAULT '',
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- NOTE: auth handled by application layer, not RLS


-- ────────────────────────────────────────────────────────────
-- From: 20260214200000_custom_requirements_section.sql
-- ────────────────────────────────────────────────────────────

-- Add section column to custom requirements
ALTER TABLE life_event_custom_requirements
  ADD COLUMN IF NOT EXISTS section text NOT NULL DEFAULT 'Custom';


-- ────────────────────────────────────────────────────────────
-- From: 20260214300000_signup_otps.sql
-- ────────────────────────────────────────────────────────────

-- Custom OTP signup table
CREATE TABLE IF NOT EXISTS signup_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  otp_hash text NOT NULL,
  password_encrypted text NOT NULL,
  password_iv text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  is_used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_signup_otps_email ON signup_otps(email);
CREATE INDEX IF NOT EXISTS idx_signup_otps_email_created ON signup_otps(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signup_otps_expires ON signup_otps(expires_at);

-- NOTE: auth handled by application layer, not RLS

-- Cleanup function: delete expired/used rows to prevent unbounded growth
CREATE OR REPLACE FUNCTION cleanup_expired_signup_otps()
RETURNS void AS $$
BEGIN
  DELETE FROM signup_otps
  WHERE expires_at < now() - interval '2 hours'
     OR (is_used = true AND created_at < now() - interval '1 hour');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- NOTE: cron.schedule() for cleanup-signup-otps skipped — node-cron handles this on Azure.


-- ────────────────────────────────────────────────────────────
-- From: 20260214400000_fix_auth_triggers.sql
-- ────────────────────────────────────────────────────────────

-- SKIPPED: Triggers on auth.users — we have our own auth_users table.
-- The functions handle_new_user() and initialize_user_subscription() are not
-- needed since we handle user creation in the application layer.

-- Clean up any stale OTP test data
DELETE FROM signup_otps WHERE expires_at < now() OR is_used = true;


-- ────────────────────────────────────────────────────────────
-- From: 20260214500000_warmup_chat_cron.sql
-- ────────────────────────────────────────────────────────────

-- SKIPPED: cron.schedule() call — node-cron handles this on Azure.


-- ────────────────────────────────────────────────────────────
-- From: 20260215000000_email_notification_logs.sql
-- ────────────────────────────────────────────────────────────

-- Add missing columns to notification_logs if table already existed
DO $$ BEGIN
  ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS channel text DEFAULT 'email';
  ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS recipient text;
  ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';
  ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS message_id text;
  -- error_message already exists from initial creation
  ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';
EXCEPTION WHEN others THEN NULL;
END $$;

-- Additional indexes
CREATE INDEX IF NOT EXISTS idx_notification_logs_user_type ON notification_logs(user_id, notification_type, sent_at DESC);


-- ────────────────────────────────────────────────────────────
-- From: 20260215100000_granular_notification_preferences.sql
-- ────────────────────────────────────────────────────────────

-- Add new granular preference columns to user_profiles
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS billing_alerts boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS document_alerts boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS engagement_digests boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS life_event_alerts boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS activity_alerts boolean DEFAULT true;

-- Also add columns to user_subscriptions for backend compatibility
ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS billing_alerts boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS document_alerts boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS engagement_digests boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS life_event_alerts boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS activity_alerts boolean DEFAULT true;


-- ────────────────────────────────────────────────────────────
-- From: 20260216000000_pending_downgrade_tracking.sql
-- ────────────────────────────────────────────────────────────

-- Add pending downgrade tracking columns to user_subscriptions
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS pending_plan text;
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS documents_to_keep text[];


-- ────────────────────────────────────────────────────────────
-- From: 20260216000000_schedule_ai_questions_reset.sql
-- ────────────────────────────────────────────────────────────

-- SKIPPED: cron.schedule() / cron.unschedule() calls — node-cron handles this on Azure.


-- ────────────────────────────────────────────────────────────
-- From: 20260216100000_schedule_data_cleanup_jobs.sql
-- ────────────────────────────────────────────────────────────

-- SKIPPED: cron.schedule() calls — node-cron handles this on Azure.


-- ────────────────────────────────────────────────────────────
-- From: 20260216200000_schedule_cron_tasks.sql
-- ────────────────────────────────────────────────────────────

-- SKIPPED: pg_net extension, trigger_cron_task() using net.http_post, and
-- cron.schedule() calls — not applicable on Azure. Node-cron handles scheduling.


-- ────────────────────────────────────────────────────────────
-- From: 20260217000000_handle_google_oauth_display_name.sql
-- ────────────────────────────────────────────────────────────

-- SKIPPED: Updates handle_new_user() trigger on auth.users — we have our own auth_users table.
-- OAuth display name extraction is handled in the application layer.


-- ────────────────────────────────────────────────────────────
-- From: 20260217100000_monthly_upload_quota.sql
-- ────────────────────────────────────────────────────────────

-- Add monthly upload quota columns
ALTER TABLE user_subscriptions
ADD COLUMN IF NOT EXISTS monthly_upload_limit INTEGER NOT NULL DEFAULT 3,
ADD COLUMN IF NOT EXISTS monthly_uploads_used INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS monthly_upload_reset_date TIMESTAMPTZ NOT NULL DEFAULT now() + interval '1 month';

-- Reset function (runs daily, resets users whose window has elapsed)
CREATE OR REPLACE FUNCTION reset_monthly_upload_counter()
RETURNS void AS $$
BEGIN
  UPDATE user_subscriptions
  SET
    monthly_uploads_used = 0,
    monthly_upload_reset_date = now() + interval '1 month',
    updated_at = now()
  WHERE monthly_upload_reset_date <= now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- NOTE: cron.schedule() for reset-monthly-uploads-daily skipped — node-cron handles this on Azure.

-- Update set_subscription_defaults() trigger to include monthly_upload_limit
CREATE OR REPLACE FUNCTION set_subscription_defaults()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.plan = 'free' THEN
    NEW.feature_flags = jsonb_build_object(
      'url_ingestion', false,
      'ocr_enabled', false,
      'auto_tags', false,
      'background_embedding', false,
      'priority_queue', 0,
      'email_notifications', false,
      'multi_device_sync', false,
      'priority_support', false,
      'global_search', false
    );
    NEW.document_limit = 3;
    NEW.ai_questions_limit = 5;
    NEW.monthly_upload_limit = 3;
  ELSIF NEW.plan = 'starter' THEN
    NEW.feature_flags = jsonb_build_object(
      'url_ingestion', true,
      'ocr_enabled', true,
      'auto_tags', true,
      'background_embedding', true,
      'priority_queue', 1,
      'email_notifications', true,
      'multi_device_sync', false,
      'priority_support', false,
      'global_search', false
    );
    NEW.document_limit = 25;
    NEW.ai_questions_limit = 999999;
    NEW.monthly_upload_limit = 30;
  ELSIF NEW.plan = 'pro' THEN
    NEW.feature_flags = jsonb_build_object(
      'url_ingestion', true,
      'ocr_enabled', true,
      'auto_tags', true,
      'background_embedding', true,
      'priority_queue', 2,
      'email_notifications', true,
      'multi_device_sync', true,
      'priority_support', true,
      'global_search', true
    );
    NEW.document_limit = 100;
    NEW.ai_questions_limit = 999999;
    NEW.monthly_upload_limit = 150;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'set_subscription_defaults failed for plan %: %', NEW.plan, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for subscription defaults
DROP TRIGGER IF EXISTS set_subscription_defaults_trigger ON user_subscriptions;
CREATE TRIGGER set_subscription_defaults_trigger
  BEFORE INSERT OR UPDATE OF plan ON user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION set_subscription_defaults();


-- ────────────────────────────────────────────────────────────
-- From: 20260218000000_reduce_free_tier_limits.sql
-- ────────────────────────────────────────────────────────────

-- Update column defaults for free tier
ALTER TABLE user_subscriptions
  ALTER COLUMN document_limit SET DEFAULT 3,
  ALTER COLUMN ai_questions_limit SET DEFAULT 5,
  ALTER COLUMN monthly_upload_limit SET DEFAULT 3;


-- ────────────────────────────────────────────────────────────
-- From: 20260219000000_fix_new_user_signup_crash.sql
-- ────────────────────────────────────────────────────────────

-- Ensure required columns exist (safe if already present)
ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS feature_flags JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS monthly_upload_limit INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS monthly_uploads_used INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_upload_reset_date TIMESTAMPTZ NOT NULL DEFAULT now() + interval '1 month',
  ADD COLUMN IF NOT EXISTS pending_plan TEXT,
  ADD COLUMN IF NOT EXISTS documents_to_keep TEXT[];

-- Ensure CHECK constraints are up to date
ALTER TABLE user_subscriptions DROP CONSTRAINT IF EXISTS user_subscriptions_plan_check;
ALTER TABLE user_subscriptions
  ADD CONSTRAINT user_subscriptions_plan_check
  CHECK (plan IN ('free', 'starter', 'pro', 'business'));

-- Status constraint: must include 'canceling'
ALTER TABLE user_subscriptions DROP CONSTRAINT IF EXISTS user_subscriptions_status_check;
ALTER TABLE user_subscriptions
  ADD CONSTRAINT user_subscriptions_status_check
  CHECK (status IN ('active', 'canceled', 'canceling', 'expired', 'trialing'));

-- NOTE: auth.users triggers skipped — we have our own auth_users table.


-- ────────────────────────────────────────────────────────────
-- From: 20260220000000_global_search.sql
-- ────────────────────────────────────────────────────────────

-- Add tsvector column for full-text search
ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS chunk_text_search tsvector;

-- GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_chunks_fts
  ON document_chunks USING gin (chunk_text_search);

-- Composite index for user-scoped vector search
CREATE INDEX IF NOT EXISTS idx_chunks_user_embedding
  ON document_chunks (user_id)
  WHERE embedding IS NOT NULL;

-- Auto-populate trigger: keeps tsvector in sync with chunk_text
CREATE OR REPLACE FUNCTION update_chunk_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW.chunk_text_search := to_tsvector('english', COALESCE(NEW.chunk_text, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

DROP TRIGGER IF EXISTS chunk_search_vector_update ON document_chunks;
CREATE TRIGGER chunk_search_vector_update
  BEFORE INSERT OR UPDATE OF chunk_text ON document_chunks
  FOR EACH ROW
  EXECUTE FUNCTION update_chunk_search_vector();

-- Global search RPC function — hybrid FTS + semantic with RRF ranking
CREATE OR REPLACE FUNCTION global_search_chunks(
  search_query text,
  query_embedding vector(4096),
  search_user_id uuid,
  filter_category text DEFAULT NULL,
  filter_tags text[] DEFAULT NULL,
  match_count int DEFAULT 20,
  similarity_threshold float DEFAULT 0.25
)
RETURNS TABLE (
  chunk_id uuid,
  document_id uuid,
  document_name text,
  document_category text,
  document_tags text[],
  chunk_index int,
  chunk_text text,
  semantic_score float,
  fts_rank float,
  combined_score float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k_rrf CONSTANT float := 60.0;  -- RRF constant
  ts_query tsquery;
BEGIN
  -- Build the full-text query
  IF TRIM(search_query) = '' THEN
    ts_query := ''::tsquery;
  ELSE
    ts_query := plainto_tsquery('english', search_query);
  END IF;

  RETURN QUERY
  WITH
  -- Semantic results
  semantic AS (
    SELECT
      dc.id AS sid,
      dc.document_id AS sdoc_id,
      dc.chunk_index AS sidx,
      dc.chunk_text AS stext,
      (1 - (dc.embedding <=> query_embedding))::float AS sem_score,
      ROW_NUMBER() OVER (ORDER BY dc.embedding <=> query_embedding) AS sem_rank
    FROM document_chunks dc
    JOIN documents d ON d.id = dc.document_id
    WHERE
      dc.user_id = search_user_id
      AND dc.embedding IS NOT NULL
      AND (1 - (dc.embedding <=> query_embedding)) >= similarity_threshold
      AND (filter_category IS NULL OR d.category = filter_category)
      AND (filter_tags IS NULL OR d.tags && filter_tags)
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count * 2
  ),

  -- Full-text results
  fts AS (
    SELECT
      dc.id AS fid,
      dc.document_id AS fdoc_id,
      dc.chunk_index AS fidx,
      dc.chunk_text AS ftext,
      ts_rank_cd(dc.chunk_text_search, ts_query)::float AS fts_score,
      ROW_NUMBER() OVER (ORDER BY ts_rank_cd(dc.chunk_text_search, ts_query) DESC) AS fts_rank
    FROM document_chunks dc
    JOIN documents d ON d.id = dc.document_id
    WHERE
      dc.user_id = search_user_id
      AND ts_query != ''::tsquery
      AND dc.chunk_text_search @@ ts_query
      AND (filter_category IS NULL OR d.category = filter_category)
      AND (filter_tags IS NULL OR d.tags && filter_tags)
    ORDER BY ts_rank_cd(dc.chunk_text_search, ts_query) DESC
    LIMIT match_count * 2
  ),

  -- Merge via RRF (Reciprocal Rank Fusion)
  merged AS (
    SELECT
      COALESCE(s.sid, f.fid) AS m_chunk_id,
      COALESCE(s.sdoc_id, f.fdoc_id) AS m_doc_id,
      COALESCE(s.sidx, f.fidx) AS m_idx,
      COALESCE(s.stext, f.ftext) AS m_text,
      COALESCE(s.sem_score, 0)::float AS m_sem_score,
      COALESCE(f.fts_score, 0)::float AS m_fts_score,
      (
        COALESCE(1.0 / (k_rrf + s.sem_rank), 0) +
        COALESCE(1.0 / (k_rrf + f.fts_rank), 0)
      )::float AS m_combined
    FROM semantic s
    FULL OUTER JOIN fts f ON s.sid = f.fid
  )

  SELECT
    m.m_chunk_id,
    m.m_doc_id,
    d.name,
    d.category,
    d.tags,
    m.m_idx,
    m.m_text,
    m.m_sem_score,
    m.m_fts_score,
    m.m_combined
  FROM merged m
  JOIN documents d ON d.id = m.m_doc_id
  ORDER BY m.m_combined DESC
  LIMIT match_count;
END;
$$;


-- ────────────────────────────────────────────────────────────
-- From: 20260220100000_global_chats_table.sql
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS global_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,  -- FK to auth_users added at bottom
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  sources jsonb,
  mentioned_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- NOTE: auth handled by application layer, not RLS

CREATE INDEX IF NOT EXISTS idx_global_chats_user_created
  ON global_chats (user_id, created_at DESC);


-- ────────────────────────────────────────────────────────────
-- From: 20260221000000_drop_insecure_analytics_views.sql
-- ────────────────────────────────────────────────────────────

-- These views referenced auth.users and are not applicable
DROP VIEW IF EXISTS public.users_approaching_limits;
DROP VIEW IF EXISTS public.feature_usage_by_tier;


-- ────────────────────────────────────────────────────────────
-- From: 20260221100000_fix_function_search_path.sql
-- ────────────────────────────────────────────────────────────

-- NOTE: Functions that use net.http_post (trigger_cron_task, trigger_embedding_generation,
-- manually_process_null_embeddings, process_null_embeddings) are SKIPPED as they depend on pg_net.

-- The remaining functions are already defined above with SET search_path = public.
-- No additional action needed.


-- ────────────────────────────────────────────────────────────
-- From: 20260222000000_user_devices.sql
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,  -- FK to auth_users added at bottom
  device_id TEXT NOT NULL,
  device_name TEXT,
  platform TEXT NOT NULL DEFAULT 'unknown',
  user_agent TEXT,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(user_id, device_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_last_active ON user_devices(last_active_at);
CREATE INDEX IF NOT EXISTS idx_user_devices_user_blocked ON user_devices(user_id, is_blocked);

-- NOTE: auth handled by application layer, not RLS

-- Helper: get device limit for a plan
CREATE OR REPLACE FUNCTION get_device_limit(plan_name TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN CASE plan_name
    WHEN 'free' THEN 1
    WHEN 'starter' THEN 2
    WHEN 'pro' THEN 5
    ELSE 1
  END;
END;
$$;

-- NOTE: cron.schedule() for cleanup-stale-devices skipped — node-cron handles this on Azure.


-- ────────────────────────────────────────────────────────────
-- From: 20260223000000_add_onboarding_fields.sql
-- ────────────────────────────────────────────────────────────

-- Add onboarding profile fields
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS expo_push_token TEXT;

-- NOTE: handle_new_user() trigger on auth.users skipped — we have our own auth_users table.


-- ────────────────────────────────────────────────────────────
-- From: 20260224000000_plaid_financial_insights.sql
-- ────────────────────────────────────────────────────────────

-- Plaid Items: one per bank connection
CREATE TABLE IF NOT EXISTS plaid_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,  -- FK to auth_users added at bottom
  item_id text NOT NULL,
  access_token text NOT NULL,
  institution_name text NOT NULL DEFAULT 'Unknown',
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, item_id)
);

-- NOTE: auth handled by application layer, not RLS

-- Plaid Accounts: individual bank accounts within an item
CREATE TABLE IF NOT EXISTS plaid_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,  -- FK to auth_users added at bottom
  item_id text NOT NULL,
  account_id text NOT NULL,
  name text NOT NULL,
  official_name text,
  type text NOT NULL,
  subtype text,
  mask text,
  initial_balance numeric(14,2),
  current_balance numeric(14,2) DEFAULT 0,
  available_balance numeric(14,2) DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, account_id)
);

-- NOTE: auth handled by application layer, not RLS

-- Plaid Transactions
CREATE TABLE IF NOT EXISTS plaid_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,  -- FK to auth_users added at bottom
  item_id text NOT NULL,
  transaction_id text NOT NULL,
  account_id text NOT NULL,
  amount numeric(14,2) NOT NULL,
  date date NOT NULL,
  name text NOT NULL,
  merchant_name text,
  category text,
  category_detailed text,
  pending boolean NOT NULL DEFAULT false,
  payment_channel text,
  currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, transaction_id)
);

-- NOTE: auth handled by application layer, not RLS

-- Financial Insights: cached AI-generated reports
CREATE TABLE IF NOT EXISTS financial_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,  -- FK to auth_users added at bottom
  report_data jsonb NOT NULL DEFAULT '{}',
  ai_recommendations text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- NOTE: auth handled by application layer, not RLS

CREATE INDEX IF NOT EXISTS idx_financial_insights_user ON financial_insights(user_id);
CREATE INDEX IF NOT EXISTS idx_financial_insights_expires ON financial_insights(user_id, expires_at DESC);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_plaid_items_user ON plaid_items(user_id);
CREATE INDEX IF NOT EXISTS idx_plaid_accounts_user ON plaid_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_plaid_accounts_item ON plaid_accounts(item_id);
CREATE INDEX IF NOT EXISTS idx_plaid_transactions_user ON plaid_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_plaid_transactions_account ON plaid_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_plaid_transactions_date ON plaid_transactions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_plaid_transactions_category ON plaid_transactions(user_id, category);


-- ────────────────────────────────────────────────────────────
-- From: 20260225000000_smart_document_prompts.sql
-- ────────────────────────────────────────────────────────────

-- Detected Loans: loans/mortgages detected from transaction patterns
CREATE TABLE IF NOT EXISTS detected_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,  -- FK to auth_users added at bottom
  loan_type text NOT NULL CHECK (loan_type IN ('mortgage', 'auto_loan', 'student_loan', 'personal_loan', 'other')),
  merchant_name text NOT NULL,
  display_name text NOT NULL,
  estimated_monthly_payment numeric(14,2) NOT NULL,
  frequency text NOT NULL DEFAULT 'monthly',
  confidence numeric(3,2) NOT NULL DEFAULT 0.50,
  first_seen_date date NOT NULL,
  last_payment_date date NOT NULL,
  payment_count int NOT NULL DEFAULT 0,
  category text,
  category_detailed text,
  dismissed boolean NOT NULL DEFAULT false,
  dismissed_at timestamptz,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, merchant_name, loan_type)
);

-- NOTE: auth handled by application layer, not RLS

CREATE INDEX IF NOT EXISTS idx_detected_loans_user ON detected_loans(user_id);
CREATE INDEX IF NOT EXISTS idx_detected_loans_active ON detected_loans(user_id) WHERE dismissed = false AND document_id IS NULL;

-- Loan Analyses: AI-generated payoff/refinancing analysis after document upload
CREATE TABLE IF NOT EXISTS loan_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,  -- FK to auth_users added at bottom
  detected_loan_id uuid NOT NULL REFERENCES detected_loans(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  extracted_data jsonb NOT NULL DEFAULT '{}',
  analysis_text text,
  payoff_timeline jsonb,
  refinancing_analysis jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- NOTE: auth handled by application layer, not RLS

CREATE INDEX IF NOT EXISTS idx_loan_analyses_user ON loan_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_loan_analyses_loan ON loan_analyses(detected_loan_id);


-- ────────────────────────────────────────────────────────────
-- From: 20260226000000_dunning_system.sql
-- ────────────────────────────────────────────────────────────

-- Add dunning columns to user_subscriptions
ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS payment_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dunning_step integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS restricted_at timestamptz,
  ADD COLUMN IF NOT EXISTS downgraded_at timestamptz,
  ADD COLUMN IF NOT EXISTS previous_plan text,
  ADD COLUMN IF NOT EXISTS deletion_scheduled_at timestamptz;

-- Constrain payment_status to known values
ALTER TABLE user_subscriptions
  DROP CONSTRAINT IF EXISTS chk_payment_status;
ALTER TABLE user_subscriptions
  ADD CONSTRAINT chk_payment_status
  CHECK (payment_status IN ('active', 'past_due', 'restricted', 'downgraded'));

-- Index for the dunning cron job
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_dunning
  ON user_subscriptions(payment_status, dunning_step)
  WHERE payment_status != 'active';

-- Dunning log table — full audit trail
CREATE TABLE IF NOT EXISTS dunning_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,  -- FK to auth_users added at bottom
  step integer NOT NULL,
  action text NOT NULL,
  details jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- NOTE: auth handled by application layer, not RLS

CREATE INDEX IF NOT EXISTS idx_dunning_log_user ON dunning_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dunning_log_action ON dunning_log(action, created_at DESC);

-- NOTE: cron.schedule() for cron-dunning-escalation skipped — node-cron handles this on Azure.


-- ────────────────────────────────────────────────────────────
-- From: 20260227000000_plaid_link_tokens.sql
-- ────────────────────────────────────────────────────────────

-- Persist Plaid link_token -> user_id mapping for Hosted Link webhook flow
CREATE TABLE IF NOT EXISTS plaid_link_tokens (
  link_token TEXT PRIMARY KEY,
  user_id UUID NOT NULL,  -- FK to auth_users added at bottom
  created_at TIMESTAMPTZ DEFAULT NOW(),
  used_at TIMESTAMPTZ  -- set when webhook successfully exchanges the token
);

-- NOTE: auth handled by application layer, not RLS
-- NOTE: cron.schedule() for cleanup-plaid-link-tokens skipped — node-cron handles this on Azure.


-- ────────────────────────────────────────────────────────────
-- From: 20260228000000_bank_account_limit.sql
-- ────────────────────────────────────────────────────────────

-- Add bank_account_limit to user_subscriptions
ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS bank_account_limit INTEGER NOT NULL DEFAULT 0;


-- ────────────────────────────────────────────────────────────
-- From: 20260301000000_financial_goals.sql
-- ────────────────────────────────────────────────────────────

-- financial_goals
CREATE TABLE IF NOT EXISTS financial_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,  -- FK to auth_users added at bottom
  goal_type text NOT NULL CHECK (goal_type IN ('savings', 'spending_limit', 'debt_paydown', 'income_target', 'ad_hoc')),
  name text NOT NULL,
  description text,
  target_amount numeric(14,2) NOT NULL CHECK (target_amount > 0),
  current_amount numeric(14,2) NOT NULL DEFAULT 0,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  target_date date NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired')),
  period_type text CHECK (period_type IN ('monthly', 'weekly', 'yearly')),
  baseline_amount numeric(14,2),
  milestones_notified jsonb NOT NULL DEFAULT '{"50": false, "75": false, "100": false}',
  completed_at timestamptz,
  expired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- NOTE: auth handled by application layer, not RLS

CREATE INDEX idx_financial_goals_user ON financial_goals(user_id);
CREATE INDEX idx_financial_goals_active ON financial_goals(user_id) WHERE status = 'active';
CREATE INDEX idx_financial_goals_archived ON financial_goals(user_id) WHERE status IN ('completed', 'expired');

-- financial_goal_accounts (many-to-many junction)
CREATE TABLE IF NOT EXISTS financial_goal_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES financial_goals(id) ON DELETE CASCADE,
  account_id text NOT NULL,
  user_id uuid NOT NULL,  -- FK to auth_users added at bottom
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(goal_id, account_id)
);

-- NOTE: auth handled by application layer, not RLS

CREATE INDEX idx_goal_accounts_goal ON financial_goal_accounts(goal_id);
CREATE INDEX idx_goal_accounts_account ON financial_goal_accounts(account_id);

-- in_app_notifications
CREATE TABLE IF NOT EXISTS in_app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,  -- FK to auth_users added at bottom
  type text NOT NULL CHECK (type IN ('goal_milestone', 'goal_completed', 'goal_expired', 'system')),
  title text NOT NULL,
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- NOTE: auth handled by application layer, not RLS

CREATE INDEX idx_in_app_notifications_user ON in_app_notifications(user_id);
CREATE INDEX idx_in_app_notifications_unread ON in_app_notifications(user_id) WHERE read = false;
CREATE INDEX idx_in_app_notifications_created ON in_app_notifications(user_id, created_at DESC);


-- ────────────────────────────────────────────────────────────
-- From: 20260302000000_goal_activities.sql
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS financial_goal_activities (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id       uuid NOT NULL REFERENCES financial_goals(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL,  -- FK to auth_users added at bottom
  amount        numeric(14,2) NOT NULL CHECK (amount > 0),
  description   text,
  activity_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- NOTE: auth handled by application layer, not RLS

-- Indexes
CREATE INDEX idx_goal_activities_goal ON financial_goal_activities(goal_id);
CREATE INDEX idx_goal_activities_user ON financial_goal_activities(user_id);
CREATE INDEX idx_goal_activities_date ON financial_goal_activities(goal_id, activity_date DESC);


-- ────────────────────────────────────────────────────────────
-- From: 20260303000000_admin_system.sql
-- ────────────────────────────────────────────────────────────

-- Admin audit log table — tracks all admin actions for accountability
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL,  -- FK to auth_users added at bottom
  action TEXT NOT NULL,
  target_user_id UUID,  -- FK to auth_users added at bottom
  target_email TEXT,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin ON admin_audit_log(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target ON admin_audit_log(target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action ON admin_audit_log(action, created_at DESC);

-- NOTE: auth handled by application layer, not RLS

-- SQL function for admin dashboard aggregate stats (single round-trip)
-- NOTE: References to auth.users replaced with auth_users
CREATE OR REPLACE FUNCTION admin_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_users', (SELECT COUNT(*) FROM auth_users),
    'active_this_week', (SELECT COUNT(*) FROM auth_users WHERE updated_at > now() - interval '7 days'),
    'new_this_month', (SELECT COUNT(*) FROM auth_users WHERE created_at > date_trunc('month', now())),
    'plan_free', (SELECT COUNT(*) FROM user_subscriptions WHERE plan = 'free'),
    'plan_starter', (SELECT COUNT(*) FROM user_subscriptions WHERE plan = 'starter'),
    'plan_pro', (SELECT COUNT(*) FROM user_subscriptions WHERE plan = 'pro'),
    'total_documents', (SELECT COUNT(*) FROM documents),
    'processing_queue', (SELECT COUNT(*) FROM documents WHERE processed = false),
    'total_chunks', (SELECT COUNT(*) FROM document_chunks),
    'docs_without_chunks', (
      SELECT COUNT(*) FROM documents d
      WHERE d.processed = true
        AND NOT EXISTS (SELECT 1 FROM document_chunks c WHERE c.document_id = d.id)
    ),
    'docs_by_category', (
      SELECT COALESCE(jsonb_object_agg(category, cnt), '{}')
      FROM (SELECT category, COUNT(*) AS cnt FROM documents GROUP BY category) sub
    ),
    'docs_by_health', (
      SELECT COALESCE(jsonb_object_agg(health_state, cnt), '{}')
      FROM (SELECT COALESCE(health_state, 'healthy') AS health_state, COUNT(*) AS cnt FROM documents GROUP BY health_state) sub
    ),
    'dunning_past_due', (SELECT COUNT(*) FROM user_subscriptions WHERE payment_status = 'past_due'),
    'dunning_restricted', (SELECT COUNT(*) FROM user_subscriptions WHERE payment_status = 'restricted'),
    'dunning_downgraded', (SELECT COUNT(*) FROM user_subscriptions WHERE payment_status = 'downgraded'),
    'churn_risk', (SELECT COUNT(*) FROM user_subscriptions WHERE cancel_at_period_end = true),
    'deletion_scheduled', (SELECT COUNT(*) FROM user_subscriptions WHERE deletion_scheduled_at IS NOT NULL),
    'total_bank_connections', (SELECT COUNT(*) FROM plaid_items),
    'total_revenue_cents', (SELECT COALESCE(SUM(amount_paid), 0) FROM invoices WHERE status = 'paid' AND deleted_at IS NULL),
    'failed_payments', (SELECT COUNT(*) FROM user_subscriptions WHERE dunning_step > 0),
    'emails_sent_24h', (SELECT COUNT(*) FROM notification_logs WHERE status = 'sent' AND sent_at > now() - interval '24 hours'),
    'emails_failed_24h', (SELECT COUNT(*) FROM notification_logs WHERE status = 'failed' AND sent_at > now() - interval '24 hours'),
    'total_ai_questions_used', (SELECT COALESCE(SUM(ai_questions_used), 0) FROM user_subscriptions),
    'total_devices', (SELECT COUNT(*) FROM user_devices),
    'active_devices_7d', (SELECT COUNT(*) FROM user_devices WHERE last_active_at > now() - interval '7 days'),
    'blocked_devices', (SELECT COUNT(*) FROM user_devices WHERE is_blocked = true),
    'total_goals', (SELECT COUNT(*) FROM financial_goals WHERE status = 'active'),
    'total_life_events', (SELECT COUNT(*) FROM life_events WHERE status = 'active')
  ) INTO result;
  RETURN result;
END;
$$;

-- SQL function for paginated admin user listing
-- NOTE: References to auth.users replaced with auth_users
CREATE OR REPLACE FUNCTION admin_list_users(
  p_search TEXT DEFAULT NULL,
  p_plan TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_limit INT DEFAULT 25,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  email TEXT,
  display_name TEXT,
  full_name TEXT,
  plan TEXT,
  status TEXT,
  payment_status TEXT,
  dunning_step INT,
  document_count BIGINT,
  ai_questions_used INT,
  last_sign_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.email::TEXT,
    COALESCE(p.display_name, '')::TEXT AS display_name,
    COALESCE(p.full_name, '')::TEXT AS full_name,
    COALESCE(s.plan, 'free')::TEXT AS plan,
    COALESCE(s.status, 'active')::TEXT AS status,
    COALESCE(s.payment_status, 'active')::TEXT AS payment_status,
    COALESCE(s.dunning_step, 0)::INT AS dunning_step,
    (SELECT COUNT(*) FROM documents d WHERE d.user_id = u.id)::BIGINT AS document_count,
    COALESCE(s.ai_questions_used, 0)::INT AS ai_questions_used,
    u.updated_at AS last_sign_in_at,  -- auth_users doesn't have last_sign_in_at, use updated_at
    u.created_at,
    COUNT(*) OVER()::BIGINT AS total_count
  FROM auth_users u
  LEFT JOIN user_profiles p ON p.id = u.id
  LEFT JOIN user_subscriptions s ON s.user_id = u.id
  WHERE (p_search IS NULL OR p_search = '' OR
         u.email ILIKE '%' || p_search || '%'
         OR COALESCE(p.display_name, '') ILIKE '%' || p_search || '%'
         OR COALESCE(p.full_name, '') ILIKE '%' || p_search || '%')
    AND (p_plan IS NULL OR p_plan = '' OR s.plan = p_plan)
    AND (p_status IS NULL OR p_status = '' OR s.payment_status = p_status)
  ORDER BY u.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- SQL function for single user detail (admin view)
-- NOTE: References to auth.users replaced with auth_users
CREATE OR REPLACE FUNCTION admin_get_user_detail(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'user', (
      SELECT jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'last_sign_in_at', u.updated_at,
        'created_at', u.created_at
      )
      FROM auth_users u WHERE u.id = p_user_id
    ),
    'profile', (
      SELECT to_jsonb(p.*) FROM user_profiles p WHERE p.id = p_user_id
    ),
    'subscription', (
      SELECT to_jsonb(s.*) FROM user_subscriptions s WHERE s.user_id = p_user_id
    ),
    'documents', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', d.id,
        'name', d.name,
        'category', d.category,
        'status', d.status,
        'health_state', d.health_state,
        'upload_date', d.upload_date,
        'expiration_date', d.expiration_date,
        'processed', d.processed,
        'tags', d.tags
      ) ORDER BY d.created_at DESC), '[]')
      FROM documents d WHERE d.user_id = p_user_id
    ),
    'devices', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', dv.id,
        'device_id', dv.device_id,
        'device_name', dv.device_name,
        'platform', dv.platform,
        'last_active_at', dv.last_active_at,
        'is_blocked', dv.is_blocked
      ) ORDER BY dv.last_active_at DESC), '[]')
      FROM user_devices dv WHERE dv.user_id = p_user_id
    ),
    'recent_activity', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'feature', ul.feature,
        'metadata', ul.metadata,
        'timestamp', ul.timestamp
      ) ORDER BY ul.timestamp DESC), '[]')
      FROM (SELECT * FROM usage_logs WHERE user_id = p_user_id ORDER BY timestamp DESC LIMIT 50) ul
    ),
    'limit_violations', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'limit_type', lv.limit_type,
        'current_value', lv.current_value,
        'limit_value', lv.limit_value,
        'timestamp', lv.timestamp
      ) ORDER BY lv.timestamp DESC), '[]')
      FROM (SELECT * FROM limit_violations WHERE user_id = p_user_id ORDER BY timestamp DESC LIMIT 30) lv
    ),
    'email_history', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'notification_type', nl.notification_type,
        'status', nl.status,
        'error_message', nl.error_message,
        'sent_at', nl.sent_at
      ) ORDER BY nl.sent_at DESC), '[]')
      FROM (SELECT * FROM notification_logs WHERE user_id = p_user_id ORDER BY sent_at DESC LIMIT 30) nl
    ),
    'bank_connections', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'institution_name', pi.institution_name,
        'connected_at', pi.connected_at,
        'last_synced_at', pi.last_synced_at,
        'account_count', (SELECT COUNT(*) FROM plaid_accounts pa WHERE pa.item_id = pi.item_id AND pa.user_id = p_user_id)
      )), '[]')
      FROM plaid_items pi WHERE pi.user_id = p_user_id
    ),
    'dunning_log', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'step', dl.step,
        'action', dl.action,
        'details', dl.details,
        'created_at', dl.created_at
      ) ORDER BY dl.created_at DESC), '[]')
      FROM dunning_log dl WHERE dl.user_id = p_user_id
    ),
    'financial_goals', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', fg.id,
        'name', fg.name,
        'goal_type', fg.goal_type,
        'status', fg.status,
        'target_amount', fg.target_amount,
        'current_amount', fg.current_amount
      )), '[]')
      FROM financial_goals fg WHERE fg.user_id = p_user_id
    )
  ) INTO result;
  RETURN result;
END;
$$;


-- ============================================================
-- Custom Auth Tables (replaces Supabase Auth)
-- ============================================================
CREATE TABLE IF NOT EXISTS auth_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  email_confirmed BOOLEAN DEFAULT false,
  provider TEXT DEFAULT 'email',
  provider_id TEXT,
  raw_user_meta_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_user_id ON auth_refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_token_hash ON auth_refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_users_email ON auth_users(email);


-- ============================================================
-- Foreign Key Constraints referencing auth_users
-- ============================================================
-- Now that auth_users exists, add all the FK constraints that
-- reference it. Tables were created above with user_id columns
-- but without FK constraints (since auth_users didn't exist yet).

ALTER TABLE user_profiles
  ADD CONSTRAINT fk_user_profiles_auth_users
  FOREIGN KEY (id) REFERENCES auth_users(id) ON DELETE CASCADE;

ALTER TABLE documents
  ADD CONSTRAINT fk_documents_auth_users
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;

ALTER TABLE document_chunks
  ADD CONSTRAINT fk_document_chunks_auth_users
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;

ALTER TABLE document_chats
  ADD CONSTRAINT fk_document_chats_auth_users
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;

ALTER TABLE notification_logs
  ADD CONSTRAINT fk_notification_logs_auth_users
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;

ALTER TABLE stripe_customers
  ADD CONSTRAINT fk_stripe_customers_auth_users
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;

ALTER TABLE user_subscriptions
  ADD CONSTRAINT fk_user_subscriptions_auth_users
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;

ALTER TABLE payment_methods
  ADD CONSTRAINT fk_payment_methods_auth_users
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;

ALTER TABLE invoices
  ADD CONSTRAINT fk_invoices_auth_users
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;

ALTER TABLE transactions
  ADD CONSTRAINT fk_transactions_auth_users
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;

ALTER TABLE review_events
  ADD CONSTRAINT fk_review_events_auth_users
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;

ALTER TABLE gap_dismissals
  ADD CONSTRAINT fk_gap_dismissals_auth_users
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;

ALTER TABLE document_relationships
  ADD CONSTRAINT fk_document_relationships_auth_users
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;

ALTER TABLE preparedness_snapshots
  ADD CONSTRAINT fk_preparedness_snapshots_auth_users
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;

ALTER TABLE usage_logs
  ADD CONSTRAINT fk_usage_logs_auth_users
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;

ALTER TABLE limit_violations
  ADD CONSTRAINT fk_limit_violations_auth_users
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;

ALTER TABLE life_events
  ADD CONSTRAINT fk_life_events_auth_users
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;

ALTER TABLE global_chats
  ADD CONSTRAINT fk_global_chats_auth_users
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;

ALTER TABLE user_devices
  ADD CONSTRAINT fk_user_devices_auth_users
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;

ALTER TABLE plaid_items
  ADD CONSTRAINT fk_plaid_items_auth_users
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;

ALTER TABLE plaid_accounts
  ADD CONSTRAINT fk_plaid_accounts_auth_users
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;

ALTER TABLE plaid_transactions
  ADD CONSTRAINT fk_plaid_transactions_auth_users
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;

ALTER TABLE financial_insights
  ADD CONSTRAINT fk_financial_insights_auth_users
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;

ALTER TABLE detected_loans
  ADD CONSTRAINT fk_detected_loans_auth_users
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;

ALTER TABLE loan_analyses
  ADD CONSTRAINT fk_loan_analyses_auth_users
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;

ALTER TABLE dunning_log
  ADD CONSTRAINT fk_dunning_log_auth_users
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;

ALTER TABLE plaid_link_tokens
  ADD CONSTRAINT fk_plaid_link_tokens_auth_users
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;

ALTER TABLE financial_goals
  ADD CONSTRAINT fk_financial_goals_auth_users
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;

ALTER TABLE financial_goal_accounts
  ADD CONSTRAINT fk_financial_goal_accounts_auth_users
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;

ALTER TABLE in_app_notifications
  ADD CONSTRAINT fk_in_app_notifications_auth_users
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;

ALTER TABLE financial_goal_activities
  ADD CONSTRAINT fk_financial_goal_activities_auth_users
  FOREIGN KEY (user_id) REFERENCES auth_users(id) ON DELETE CASCADE;

ALTER TABLE admin_audit_log
  ADD CONSTRAINT fk_admin_audit_log_admin_auth_users
  FOREIGN KEY (admin_id) REFERENCES auth_users(id) ON DELETE CASCADE;

ALTER TABLE admin_audit_log
  ADD CONSTRAINT fk_admin_audit_log_target_auth_users
  FOREIGN KEY (target_user_id) REFERENCES auth_users(id) ON DELETE SET NULL;


-- ============================================================
-- Migration Complete
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE 'Consolidated Azure PostgreSQL migration completed successfully';
  RAISE NOTICE 'All tables, indexes, functions, and constraints created';
END $$;
