-- 0041_credit_wallet_stripe_pm.sql
-- Saved Stripe customer + payment method on prepaid credit wallets for
-- off-session auto top-up. Owner paste into Supabase SQL editor.
-- Requires: 0039_prepaid_credit.sql

alter table company_credit_wallets
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_payment_method_id text;

comment on column company_credit_wallets.stripe_customer_id is
  'Stripe customer for company credit Checkout / portal / off-session top-up';
comment on column company_credit_wallets.stripe_payment_method_id is
  'Saved payment method from Checkout setup_future_usage=off_session';
