-- Add bank_account_limit to user_subscriptions
-- Free = 0, Starter = 2, Pro = 5

ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS bank_account_limit INTEGER NOT NULL DEFAULT 0;

-- Backfill existing rows based on current plan
UPDATE public.user_subscriptions SET bank_account_limit = 0 WHERE plan = 'free';
UPDATE public.user_subscriptions SET bank_account_limit = 2 WHERE plan = 'starter';
UPDATE public.user_subscriptions SET bank_account_limit = 5 WHERE plan = 'pro';
