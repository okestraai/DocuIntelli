/*
  # Billing Data Schema for Stripe Sync

  1. New Tables
    - `payment_methods`: Store customer payment methods
    - `invoices`: Store Stripe invoices
    - `transactions`: Store payment transactions/charges

  2. Security
    - Enable RLS on all tables
    - Users can only view their own billing data

  3. Indexes
    - Add indexes for faster lookups
*/

-- Create payment_methods table
CREATE TABLE IF NOT EXISTS payment_methods (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  payment_method_id text NOT NULL UNIQUE,
  customer_id text NOT NULL,
  type text NOT NULL DEFAULT 'card',
  brand text,
  name_on_card text,
  last4 text,
  exp_month integer,
  exp_year integer,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

-- Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  invoice_id text NOT NULL UNIQUE,
  customer_id text NOT NULL,
  subscription_id text,
  invoice_number text,
  status text NOT NULL,
  amount_due bigint NOT NULL,
  amount_paid bigint NOT NULL,
  amount_remaining bigint NOT NULL,
  subtotal bigint NOT NULL,
  tax bigint DEFAULT 0,
  total bigint NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  invoice_pdf text,
  hosted_invoice_url text,
  billing_reason text,
  due_date timestamptz,
  paid_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  transaction_id text NOT NULL UNIQUE,
  customer_id text NOT NULL,
  invoice_id text,
  charge_id text,
  payment_intent_id text,
  amount bigint NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL,
  description text,
  receipt_url text,
  payment_method_id text,
  payment_method_brand text,
  payment_method_last4 text,
  refunded boolean DEFAULT false,
  refund_amount bigint DEFAULT 0,
  failure_code text,
  failure_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

-- Enable RLS
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for payment_methods
CREATE POLICY "Users can view own payment methods"
  ON payment_methods
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() AND deleted_at IS NULL);

CREATE POLICY "Service role can manage payment methods"
  ON payment_methods
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS Policies for invoices
CREATE POLICY "Users can view own invoices"
  ON invoices
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() AND deleted_at IS NULL);

CREATE POLICY "Service role can manage invoices"
  ON invoices
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS Policies for transactions
CREATE POLICY "Users can view own transactions"
  ON transactions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() AND deleted_at IS NULL);

CREATE POLICY "Service role can manage transactions"
  ON transactions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_payment_methods_user_id ON payment_methods(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payment_methods_customer_id ON payment_methods(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payment_methods_is_default ON payment_methods(user_id, is_default) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(user_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(user_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_customer_id ON transactions(customer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(user_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(user_id, created_at DESC) WHERE deleted_at IS NULL;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_billing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_payment_methods_updated_at
  BEFORE UPDATE ON payment_methods
  FOR EACH ROW
  EXECUTE FUNCTION update_billing_updated_at();

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_billing_updated_at();

CREATE TRIGGER update_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_billing_updated_at();
