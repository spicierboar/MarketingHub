-- 0014 — Bulk one-time-connect onboarding (Module 1 scale foundation).
--
-- Agency admins generate single-use invite links per (company, platform); clients
-- complete OAuth (or paste a token for TikTok/demo) at /connect/[token] without
-- logging into the Command Centre. Token is the secret; expires + revocable.

create table if not exists connect_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  platform text not null,
  token text not null unique,
  account_name_hint text,
  recipient_email text,
  status text not null default 'pending',
  invited_by text not null,
  completed_at timestamptz,
  integration_id uuid references publishing_integrations (id) on delete set null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_connect_invites_tenant on connect_invites (tenant_id);
create index if not exists idx_connect_invites_company on connect_invites (company_id);
create index if not exists idx_connect_invites_token on connect_invites (token);
create index if not exists idx_connect_invites_pending on connect_invites (tenant_id, status)
  where status = 'pending';

alter table connect_invites enable row level security;

create policy ci_access on connect_invites for all
  using (has_company_access(company_id))
  with check (has_company_access(company_id));
