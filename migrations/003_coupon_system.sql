-- 003_coupon_system.sql
-- Coupon system: admin-managed coupon codes that grant trial access to paid plans

-- ── Coupons table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  description TEXT,
  plan TEXT NOT NULL DEFAULT 'pro',
  trial_days INTEGER NOT NULL DEFAULT 30,
  max_uses INTEGER,                          -- NULL = unlimited
  current_uses INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,                    -- NULL = never expires
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT coupons_code_unique UNIQUE (code),
  CONSTRAINT coupons_plan_check CHECK (plan IN ('starter', 'pro')),
  CONSTRAINT coupons_trial_days_check CHECK (trial_days > 0 AND trial_days <= 365),
  CONSTRAINT coupons_created_by_fk FOREIGN KEY (created_by) REFERENCES auth_users(id)
);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_is_active ON coupons(is_active);

-- ── Coupon redemptions table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES coupons(id),
  user_id UUID NOT NULL REFERENCES auth_users(id),
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  stripe_checkout_session_id TEXT,
  stripe_subscription_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon ON coupon_redemptions(coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_user ON coupon_redemptions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_coupon_redemptions_unique
  ON coupon_redemptions(coupon_id, user_id);
