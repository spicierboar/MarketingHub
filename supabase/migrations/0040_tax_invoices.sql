-- 0040_tax_invoices.sql
-- Local tax-invoice suite (AU GST fields) + Stripe refs for credit top-ups.
-- Owner paste into Supabase SQL editor.
-- Requires: 0001 helpers (has_company_access, is_tenant_member, is_tenant_admin).
-- Stripe Checkout (mode=payment, metadata.kind=credit_top_up) credits the wallet
-- via webhook; this table is the legal SoT (not Stripe Invoice alone).

create table if not exists tax_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  invoice_number text not null,
  kind text not null,
  -- credit_top_up | management_fee | subscription | credit_note | adjustment
  status text not null default 'issued',
  -- issued | void | credited
  currency text not null default 'usd',
  seller jsonb not null default '{}'::jsonb,
  buyer jsonb not null default '{}'::jsonb,
  lines jsonb not null default '[]'::jsonb,
  subtotal_ex_gst numeric not null default 0,
  gst_amount numeric not null default 0,
  total_inc_gst numeric not null default 0,
  gst_inclusive boolean not null default true,
  notes text,
  related_type text,
  related_id text,
  credits_invoice_id uuid references tax_invoices (id) on delete set null,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  stripe_invoice_id text,
  issued_at timestamptz not null default now(),
  voided_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tax_invoices_number_tenant_unique unique (tenant_id, invoice_number)
);

create unique index if not exists tax_invoices_stripe_session_unique
  on tax_invoices (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create index if not exists tax_invoices_tenant_issued_idx
  on tax_invoices (tenant_id, issued_at desc);
create index if not exists tax_invoices_company_issued_idx
  on tax_invoices (company_id, issued_at desc);

alter table tax_invoices enable row level security;

drop policy if exists tax_invoices_access on tax_invoices;
create policy tax_invoices_access on tax_invoices
  for all using (has_company_access(company_id))
  with check (has_company_access(company_id));

comment on table tax_invoices is
  'Local AU tax invoices (GST); Stripe session/PI/invoice ids are payment proof only';
