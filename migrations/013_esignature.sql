-- ============================================================================
-- Migration 013: e-Signature Feature
-- ============================================================================
-- Adds tables for integrated e-Signature workflows:
--   signature_requests  — top-level envelope
--   signature_signers   — participants
--   signature_fields    — placed form fields
--   signature_audit_log — immutable event log
--   signature_images    — reusable signature/initials per user
-- ============================================================================

-- 1. Signature Requests -------------------------------------------------------

CREATE TABLE IF NOT EXISTS signature_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  document_id       UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  message           TEXT,
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','pending','completed','voided','expired')),
  signing_order     TEXT NOT NULL DEFAULT 'parallel'
                    CHECK (signing_order IN ('parallel','sequential')),
  document_hash     TEXT,
  signed_file_path  TEXT,
  expires_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  voided_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sigreq_owner   ON signature_requests(owner_id);
CREATE INDEX IF NOT EXISTS idx_sigreq_doc     ON signature_requests(document_id);
CREATE INDEX IF NOT EXISTS idx_sigreq_status  ON signature_requests(status);

-- 2. Signature Signers --------------------------------------------------------

CREATE TABLE IF NOT EXISTS signature_signers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signature_request_id  UUID NOT NULL REFERENCES signature_requests(id) ON DELETE CASCADE,
  signer_email          TEXT NOT NULL,
  signer_name           TEXT NOT NULL,
  signer_user_id        UUID REFERENCES auth_users(id) ON DELETE SET NULL,
  signing_order_index   INTEGER NOT NULL DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','notified','viewed','signed','declined')),
  signing_token         TEXT UNIQUE NOT NULL,
  signing_token_expires_at TIMESTAMPTZ NOT NULL,
  signed_at             TIMESTAMPTZ,
  declined_at           TIMESTAMPTZ,
  ip_address            TEXT,
  user_agent            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(signature_request_id, signer_email)
);

CREATE INDEX IF NOT EXISTS idx_sigsigner_request ON signature_signers(signature_request_id);
CREATE INDEX IF NOT EXISTS idx_sigsigner_token   ON signature_signers(signing_token);
CREATE INDEX IF NOT EXISTS idx_sigsigner_email   ON signature_signers(signer_email);
CREATE INDEX IF NOT EXISTS idx_sigsigner_userid  ON signature_signers(signer_user_id);

-- 3. Signature Fields ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS signature_fields (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signature_request_id  UUID NOT NULL REFERENCES signature_requests(id) ON DELETE CASCADE,
  signer_id             UUID NOT NULL REFERENCES signature_signers(id) ON DELETE CASCADE,
  field_type            TEXT NOT NULL
                        CHECK (field_type IN (
                          'signature','full_name','initials','date_signed',
                          'text_field','checkbox','title_role','company_name','custom_text'
                        )),
  page_number           INTEGER NOT NULL,
  x_percent             NUMERIC(7,4) NOT NULL,
  y_percent             NUMERIC(7,4) NOT NULL,
  width_percent         NUMERIC(7,4) NOT NULL,
  height_percent        NUMERIC(7,4) NOT NULL,
  label                 TEXT,
  required              BOOLEAN NOT NULL DEFAULT true,
  value                 TEXT,
  filled_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sigfield_request ON signature_fields(signature_request_id);
CREATE INDEX IF NOT EXISTS idx_sigfield_signer  ON signature_fields(signer_id);

-- 4. Signature Audit Log ------------------------------------------------------

CREATE TABLE IF NOT EXISTS signature_audit_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signature_request_id  UUID NOT NULL REFERENCES signature_requests(id) ON DELETE CASCADE,
  signer_id             UUID REFERENCES signature_signers(id) ON DELETE SET NULL,
  actor_user_id         UUID REFERENCES auth_users(id) ON DELETE SET NULL,
  action                TEXT NOT NULL
                        CHECK (action IN (
                          'request_created','request_sent','request_voided','request_expired',
                          'signer_notified','signer_viewed','signer_signed','signer_declined',
                          'field_filled','document_completed','reminder_sent',
                          'vault_captured'
                        )),
  metadata              JSONB DEFAULT '{}',
  ip_address            TEXT,
  user_agent            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sigaudit_request ON signature_audit_log(signature_request_id);
CREATE INDEX IF NOT EXISTS idx_sigaudit_signer  ON signature_audit_log(signer_id);

-- 5. Signature Images (reusable per user) -------------------------------------

CREATE TABLE IF NOT EXISTS signature_images (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  image_type    TEXT NOT NULL CHECK (image_type IN ('signature','initials')),
  image_data    TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, image_type)
);

CREATE INDEX IF NOT EXISTS idx_sigimg_user ON signature_images(user_id);
