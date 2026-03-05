-- =============================================================================
-- 005_emergency_access.sql
-- Emergency Access & Trusted Contacts — extends Life Events feature
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. trusted_contacts — Global list of people an owner trusts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trusted_contacts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  contact_email TEXT NOT NULL,
  contact_user_id UUID REFERENCES auth_users(id) ON DELETE SET NULL,
  display_name  TEXT NOT NULL,
  relationship  TEXT,  -- e.g. 'spouse', 'attorney', 'sibling', 'parent', 'friend', 'business_partner'
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'revoked')),
  invite_token  TEXT UNIQUE,          -- SHA-256 hash of the raw token sent in email
  invite_sent_at  TIMESTAMPTZ,
  accepted_at     TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(owner_id, contact_email)
);

CREATE INDEX IF NOT EXISTS idx_trusted_contacts_owner        ON trusted_contacts(owner_id);
CREATE INDEX IF NOT EXISTS idx_trusted_contacts_contact_user ON trusted_contacts(contact_user_id);
CREATE INDEX IF NOT EXISTS idx_trusted_contacts_email        ON trusted_contacts(contact_email);
CREATE INDEX IF NOT EXISTS idx_trusted_contacts_invite_token ON trusted_contacts(invite_token);

-- ---------------------------------------------------------------------------
-- 2. emergency_access_grants — Per-life-event access config + request state
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS emergency_access_grants (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  life_event_id       UUID NOT NULL REFERENCES life_events(id) ON DELETE CASCADE,
  trusted_contact_id  UUID NOT NULL REFERENCES trusted_contacts(id) ON DELETE CASCADE,
  access_policy       TEXT NOT NULL DEFAULT 'approval'
                      CHECK (access_policy IN ('immediate', 'time_delayed', 'approval')),
  delay_hours         INTEGER DEFAULT 72
                      CHECK (delay_hours >= 1 AND delay_hours <= 2160), -- 1 hour to 90 days
  is_active           BOOLEAN NOT NULL DEFAULT true,
  request_status      TEXT NOT NULL DEFAULT 'none'
                      CHECK (request_status IN ('none', 'pending', 'approved', 'denied', 'auto_granted', 'vetoed')),
  access_requested_at TIMESTAMPTZ,
  access_granted_at   TIMESTAMPTZ,
  cooldown_ends_at    TIMESTAMPTZ,
  owner_action_at     TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(life_event_id, trusted_contact_id)
);

CREATE INDEX IF NOT EXISTS idx_ea_grants_life_event ON emergency_access_grants(life_event_id);
CREATE INDEX IF NOT EXISTS idx_ea_grants_contact    ON emergency_access_grants(trusted_contact_id);
CREATE INDEX IF NOT EXISTS idx_ea_grants_active     ON emergency_access_grants(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_ea_grants_cooldown   ON emergency_access_grants(cooldown_ends_at)
  WHERE cooldown_ends_at IS NOT NULL AND access_granted_at IS NULL AND request_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_ea_grants_status     ON emergency_access_grants(request_status);

-- ---------------------------------------------------------------------------
-- 3. emergency_access_audit_log — Immutable append-only activity log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS emergency_access_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id      UUID NOT NULL REFERENCES emergency_access_grants(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL REFERENCES auth_users(id),
  action        TEXT NOT NULL
                CHECK (action IN (
                  'grant_created', 'grant_revoked', 'grant_updated',
                  'access_requested', 'access_granted', 'access_auto_granted',
                  'access_denied', 'access_vetoed',
                  'document_viewed',
                  'invite_sent', 'invite_accepted'
                )),
  document_id   UUID REFERENCES documents(id) ON DELETE SET NULL,
  metadata      JSONB DEFAULT '{}',
  ip_address    TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ea_audit_grant    ON emergency_access_audit_log(grant_id);
CREATE INDEX IF NOT EXISTS idx_ea_audit_actor    ON emergency_access_audit_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_ea_audit_action   ON emergency_access_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_ea_audit_document ON emergency_access_audit_log(document_id) WHERE document_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ea_audit_created  ON emergency_access_audit_log(created_at);

-- ---------------------------------------------------------------------------
-- 4. Updated_at triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trusted_contacts_updated_at ON trusted_contacts;
CREATE TRIGGER trg_trusted_contacts_updated_at
  BEFORE UPDATE ON trusted_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_ea_grants_updated_at ON emergency_access_grants;
CREATE TRIGGER trg_ea_grants_updated_at
  BEFORE UPDATE ON emergency_access_grants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
