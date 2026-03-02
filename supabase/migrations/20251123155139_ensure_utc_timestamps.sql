/*
  # Ensure UTC Timestamp Configuration
  
  ## Purpose
  This migration ensures all timestamps in the database are consistently stored and handled in UTC.
  
  ## Key Points
  1. PostgreSQL timezone is set to UTC (default for Supabase)
  2. All timestamp columns use `timestamptz` (timestamp with timezone) data type
  3. Default values use `now()` function which returns current UTC time
  4. Triggers use `now()` for automatic timestamp updates
  
  ## Tables with Timestamps
  - `documents`: created_at, updated_at (UTC)
  - `document_chunks`: created_at (UTC)
  - `user_profiles`: created_at, updated_at (UTC)
  - `document_chats`: created_at (UTC)
  
  ## Best Practices
  - Always store timestamps in UTC in the database
  - Convert to user's local timezone only in the UI layer for display
  - Use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ) for API data exchange
  - Application code uses `new Date().toISOString()` for UTC timestamps
  
  ## Notes
  - This migration is idempotent and primarily serves as documentation
  - No schema changes needed as existing tables already use proper UTC handling
*/

-- Verify PostgreSQL is using UTC timezone (should already be set)
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
