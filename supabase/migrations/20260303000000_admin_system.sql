-- ╔══════════════════════════════════════════════════════════════╗
-- ║  Admin System — audit log, dashboard stats, user listing  ║
-- ╚══════════════════════════════════════════════════════════════╝

-- 1. Admin audit log table — tracks all admin actions for accountability
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_email TEXT,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin ON admin_audit_log(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target ON admin_audit_log(target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action ON admin_audit_log(action, created_at DESC);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Only service_role can access (admin routes use service_role key)
CREATE POLICY "Service role full access on admin_audit_log"
  ON admin_audit_log FOR ALL
  USING (true)
  WITH CHECK (true);

-- Restrict to service role via grant (RLS + grant = defense in depth)
REVOKE ALL ON admin_audit_log FROM authenticated;
GRANT ALL ON admin_audit_log TO service_role;

-- 2. SQL function for admin dashboard aggregate stats (single round-trip)
CREATE OR REPLACE FUNCTION admin_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_users', (SELECT COUNT(*) FROM auth.users),
    'active_this_week', (SELECT COUNT(*) FROM auth.users WHERE last_sign_in_at > now() - interval '7 days'),
    'new_this_month', (SELECT COUNT(*) FROM auth.users WHERE created_at > date_trunc('month', now())),
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

-- 3. SQL function for paginated admin user listing (cross-schema join)
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
    u.last_sign_in_at,
    u.created_at,
    COUNT(*) OVER()::BIGINT AS total_count
  FROM auth.users u
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

-- 4. SQL function for single user detail (admin view)
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
        'last_sign_in_at', u.last_sign_in_at,
        'created_at', u.created_at
      )
      FROM auth.users u WHERE u.id = p_user_id
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
