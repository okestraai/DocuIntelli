-- Migration: Fix mutable search_path on all public functions
-- Security fix: Without SET search_path, a malicious actor with CREATE privilege
-- on a schema earlier in the search_path could shadow tables/functions and hijack
-- execution inside SECURITY DEFINER functions. Adding SET search_path = public
-- pins resolution to the intended schema.
--
-- Note: app.get_service_role is a Supabase platform function, not managed by us.

-- 1. cleanup_expired_signup_otps
CREATE OR REPLACE FUNCTION cleanup_expired_signup_otps()
RETURNS void AS $$
BEGIN
  DELETE FROM signup_otps
  WHERE expires_at < now() - interval '2 hours'
     OR (is_used = true AND created_at < now() - interval '1 hour');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- 2. update_life_events_updated_at
CREATE OR REPLACE FUNCTION update_life_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- 3. trigger_cron_task
CREATE OR REPLACE FUNCTION trigger_cron_task(task_name TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supabase_url TEXT;
  v_service_role_key TEXT;
  v_function_url TEXT;
  v_request_id BIGINT;
BEGIN
  -- Get Supabase URL and service role key
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_role_key := current_setting('app.settings.service_role_key', true);

  -- Fallback to vault if settings not available
  IF v_supabase_url IS NULL THEN
    SELECT decrypted_secret INTO v_supabase_url
    FROM vault.decrypted_secrets
    WHERE name = 'SUPABASE_URL'
    LIMIT 1;
  END IF;

  IF v_service_role_key IS NULL THEN
    SELECT decrypted_secret INTO v_service_role_key
    FROM vault.decrypted_secrets
    WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
    LIMIT 1;
  END IF;

  -- Last-resort fallback
  IF v_supabase_url IS NULL THEN
    v_supabase_url := COALESCE(
      current_setting('request.headers', true)::json->>'x-forwarded-host',
      'https://caygpjhiakabaxtklnlw.supabase.co'
    );
    IF NOT v_supabase_url LIKE 'http%' THEN
      v_supabase_url := 'https://' || v_supabase_url;
    END IF;
  END IF;

  v_function_url := v_supabase_url || '/functions/v1/cron-tasks';

  RAISE LOG 'Triggering cron task "%": %', task_name, v_function_url;

  SELECT net.http_post(
    url := v_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(v_service_role_key, '')
    ),
    body := jsonb_build_object('task', task_name),
    timeout_milliseconds := 55000
  ) INTO v_request_id;

  RAISE LOG 'Cron task "%" triggered, request_id: %', task_name, v_request_id;
END;
$$;

-- 4. trigger_embedding_generation
CREATE OR REPLACE FUNCTION trigger_embedding_generation()
RETURNS trigger AS $$
DECLARE
  v_supabase_url text;
  v_service_role_key text;
  v_request_id bigint;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_supabase_url
    FROM vault.decrypted_secrets
    WHERE name = 'SUPABASE_URL'
    LIMIT 1;

    SELECT decrypted_secret INTO v_service_role_key
    FROM vault.decrypted_secrets
    WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_supabase_url := current_setting('app.settings.supabase_url', true);
    v_service_role_key := current_setting('app.settings.service_role_key', true);
  END;

  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    v_supabase_url := 'https://' || current_setting('request.headers', true)::json->>'host';
  END IF;

  IF v_supabase_url IS NOT NULL AND v_supabase_url != '' THEN
    BEGIN
      SELECT net.http_post(
        url := v_supabase_url || '/functions/v1/generate-embeddings',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || COALESCE(v_service_role_key, '')
        ),
        body := jsonb_build_object(
          'document_id', NEW.document_id,
          'limit', 10
        ),
        timeout_milliseconds := 30000
      ) INTO v_request_id;

      RAISE NOTICE 'Triggered embedding generation for document % (request_id: %)', NEW.document_id, v_request_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to trigger embedding generation: %', SQLERRM;
    END;
  ELSE
    RAISE WARNING 'Supabase URL not configured, cannot trigger embedding generation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- 5. check_document_limit
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

-- 6. update_chunk_search_vector
CREATE OR REPLACE FUNCTION update_chunk_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW.chunk_text_search := to_tsvector('english', COALESCE(NEW.chunk_text, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- 7. generate_missing_embeddings
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

-- 8. reset_ai_questions_counter
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

-- 9. manually_process_null_embeddings
CREATE OR REPLACE FUNCTION manually_process_null_embeddings()
RETURNS TABLE(
  success boolean,
  message text,
  chunks_needing_processing bigint
) AS $$
DECLARE
  v_count bigint;
  v_url text;
  v_response_id bigint;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM document_chunks
  WHERE embedding IS NULL
    AND chunk_text IS NOT NULL
    AND chunk_text != '';

  IF v_count = 0 THEN
    RETURN QUERY SELECT true, 'No chunks need processing', 0::bigint;
    RETURN;
  END IF;

  v_url := current_setting('app.supabase_url', true) || '/functions/v1/process-null-embeddings';

  BEGIN
    SELECT net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
      )
    ) INTO v_response_id;

    RETURN QUERY SELECT true, 'Embedding processing triggered for ' || v_count::text || ' chunks', v_count;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT false, 'Failed to trigger processing: ' || SQLERRM, v_count;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- 10. delete_document_cascade
CREATE OR REPLACE FUNCTION delete_document_cascade(
  p_document_id uuid,
  p_user_id uuid
)
RETURNS TABLE(file_path text, success boolean, message text) AS $$
DECLARE
  v_file_path text;
  v_document_exists boolean;
BEGIN
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

  UPDATE notification_logs
  SET document_ids = (
    SELECT jsonb_agg(elem)
    FROM jsonb_array_elements_text(document_ids) elem
    WHERE elem::text != p_document_id::text
  )
  WHERE document_ids ? p_document_id::text;

  DELETE FROM document_chats
  WHERE document_id = p_document_id AND user_id = p_user_id;

  DELETE FROM document_chunks
  WHERE document_id = p_document_id AND user_id = p_user_id;

  DELETE FROM document_files
  WHERE document_id = p_document_id;

  DELETE FROM documents
  WHERE id = p_document_id AND user_id = p_user_id;

  RETURN QUERY SELECT v_file_path, true, 'Document and all related data deleted successfully';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- 11. process_null_embeddings
CREATE OR REPLACE FUNCTION process_null_embeddings()
RETURNS TABLE(
  document_id uuid,
  chunks_with_null_embedding bigint,
  triggered boolean
) AS $$
DECLARE
  v_doc RECORD;
  v_supabase_url text;
  v_service_role_key text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_supabase_url
    FROM vault.decrypted_secrets
    WHERE name = 'SUPABASE_URL'
    LIMIT 1;

    SELECT decrypted_secret INTO v_service_role_key
    FROM vault.decrypted_secrets
    WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_supabase_url := current_setting('app.settings.supabase_url', true);
    v_service_role_key := current_setting('app.settings.service_role_key', true);
  END;

  FOR v_doc IN
    SELECT dc.document_id, COUNT(*) as null_count
    FROM document_chunks dc
    WHERE dc.embedding IS NULL
    GROUP BY dc.document_id
  LOOP
    BEGIN
      PERFORM net.http_post(
        url := v_supabase_url || '/functions/v1/generate-embeddings',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || COALESCE(v_service_role_key, '')
        ),
        body := jsonb_build_object(
          'document_id', v_doc.document_id,
          'limit', 20
        ),
        timeout_milliseconds := 60000
      );

      RETURN QUERY SELECT v_doc.document_id, v_doc.null_count, true;
    EXCEPTION WHEN OTHERS THEN
      RETURN QUERY SELECT v_doc.document_id, v_doc.null_count, false;
    END;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- 12. update_billing_updated_at
CREATE OR REPLACE FUNCTION update_billing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;
