-- ============================================================================
-- Add onboarding profile fields: full_name, date_of_birth, phone
-- These columns power the mandatory onboarding modal shown after signup.
-- ============================================================================

-- 1. Add new columns to user_profiles
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS phone TEXT;

-- 2. Backfill: copy display_name → full_name for existing users
UPDATE user_profiles
SET full_name = display_name
WHERE full_name IS NULL
  AND display_name IS NOT NULL
  AND display_name != '';

-- 3. Rebuild handle_new_user() to also populate full_name from OAuth metadata.
--    CRITICAL: Must keep EXCEPTION WHEN OTHERS block + SET search_path.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, display_name, full_name)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'display_name', ''),
      NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
      NULLIF(NEW.raw_user_meta_data->>'name', ''),
      ''
    ),
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
      NULLIF(NEW.raw_user_meta_data->>'name', ''),
      NULLIF(NEW.raw_user_meta_data->>'display_name', ''),
      NULL
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;
