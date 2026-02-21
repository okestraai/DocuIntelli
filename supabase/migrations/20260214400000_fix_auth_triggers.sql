-- ============================================================================
-- Fix auth.users triggers that fire on signup
-- Problem: "Database error creating new user" during admin.createUser()
-- Root cause: handle_new_user() has no ON CONFLICT and no error handling,
--   so any issue in user_profiles INSERT rolls back the entire user creation.
--   Both trigger functions also lack SET search_path (required for SECURITY
--   DEFINER in newer Postgres).
-- ============================================================================

-- 1. Fix handle_new_user(): add ON CONFLICT + exception handling + search_path
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- 2. Fix initialize_user_subscription(): explicit schema + correct limits + search_path
CREATE OR REPLACE FUNCTION initialize_user_subscription()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_subscriptions (user_id, plan, status, document_limit, ai_questions_limit)
  VALUES (NEW.id, 'free', 'active', 5, 10)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'initialize_user_subscription failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- 3. Ensure triggers exist (re-create if missing)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;
CREATE TRIGGER on_auth_user_created_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION initialize_user_subscription();

-- 4. Clean up any stale OTP test data
DELETE FROM signup_otps WHERE expires_at < now() OR is_used = true;
