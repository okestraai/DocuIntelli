-- =============================================================================
-- 007_support_tickets.sql
-- Support Ticketing System
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. support_tickets — User-raised support tickets
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_tickets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  subject     TEXT NOT NULL,
  description TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'general'
              CHECK (category IN ('general', 'billing', 'technical', 'account', 'feature_request', 'bug_report')),
  priority    TEXT NOT NULL DEFAULT 'medium'
              CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status      TEXT NOT NULL DEFAULT 'open'
              CHECK (status IN ('open', 'in_progress', 'waiting_on_user', 'resolved', 'closed')),
  assigned_to UUID REFERENCES auth_users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  closed_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-incrementing human-readable ticket number (TKT-001000, TKT-001001, ...)
CREATE SEQUENCE IF NOT EXISTS support_ticket_number_seq START WITH 1000;
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS ticket_number TEXT NOT NULL
    DEFAULT 'TKT-' || LPAD(nextval('support_ticket_number_seq')::text, 6, '0')
    UNIQUE;

CREATE INDEX IF NOT EXISTS idx_support_tickets_user     ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status   ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_priority ON support_tickets(priority);
CREATE INDEX IF NOT EXISTS idx_support_tickets_category ON support_tickets(category);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned ON support_tickets(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_support_tickets_created  ON support_tickets(created_at);

-- ---------------------------------------------------------------------------
-- 2. support_ticket_messages — Threaded replies on a ticket
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id  UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id  UUID NOT NULL REFERENCES auth_users(id),
  is_admin   BOOLEAN NOT NULL DEFAULT false,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket  ON support_ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_created ON support_ticket_messages(created_at);

-- ---------------------------------------------------------------------------
-- 3. Updated_at trigger (reuse existing function from migration 001)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_support_tickets_updated_at ON support_tickets;
CREATE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
