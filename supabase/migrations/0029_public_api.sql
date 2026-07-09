-- 0029 — Public REST API + partner webhooks (M27).
--
-- Tenant-scoped API keys (hashed secrets) and outbound partner webhook
-- endpoints. RLS mirrors app-layer tenant isolation.

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  name text not null,
  key_prefix text not null,
  key_hash text not null,
  scopes text[] not null default '{}',
  company_ids uuid[],
  created_by text not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_api_keys_prefix on api_keys (key_prefix);
create index if not exists idx_api_keys_tenant on api_keys (tenant_id);

alter table api_keys enable row level security;

create policy api_keys_tenant on api_keys for all
  using (is_tenant_admin(tenant_id))
  with check (is_tenant_admin(tenant_id));

create table if not exists partner_webhooks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  label text not null,
  url text not null,
  events text[] not null default '{}',
  secret_enc text not null,
  status text not null default 'pending',
  created_by text not null,
  verified_at timestamptz,
  last_delivery_at timestamptz,
  last_delivery_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_partner_webhooks_tenant on partner_webhooks (tenant_id);

alter table partner_webhooks enable row level security;

create policy partner_webhooks_tenant on partner_webhooks for all
  using (is_tenant_admin(tenant_id))
  with check (is_tenant_admin(tenant_id));
