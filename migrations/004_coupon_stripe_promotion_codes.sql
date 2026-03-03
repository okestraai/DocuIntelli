-- 004_coupon_stripe_promotion_codes.sql
-- Add Stripe Coupon + Promotion Code IDs to coupons table.
-- Coupons are now created as native Stripe Promotion Codes for better checkout UX.

ALTER TABLE coupons ADD COLUMN IF NOT EXISTS stripe_coupon_id TEXT;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS stripe_promotion_code_id TEXT;
