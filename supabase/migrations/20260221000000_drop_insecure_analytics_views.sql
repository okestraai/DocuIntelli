-- Migration: Drop insecure analytics views
-- Security fix: users_approaching_limits and feature_usage_by_tier are unused
-- admin analytics views that expose auth.users data and bypass RLS via
-- SECURITY DEFINER (Postgres default for views). Nothing in the codebase
-- queries them, so dropping is the safest remediation.

DROP VIEW IF EXISTS public.users_approaching_limits;
DROP VIEW IF EXISTS public.feature_usage_by_tier;
