-- 0007 — Client onboarding + versioned Terms & Conditions (2026-07-07).
--
-- • terms_versions: PLATFORM-level (not tenant-scoped) — one set of terms
--   governs every customer. The current terms = the active row with the highest
--   version. Publishing a new version supersedes prior (active=false) and bumps
--   the number, which forces every user to re-accept via the /accept-terms gate.
-- • terms_acceptances: a user's acceptance of a version, recorded with the
--   tenant context at acceptance time (for audit + tenant-scoped export/purge).
-- • tenants: onboarding details (jsonb) + completion timestamp so the app gate
--   can route a not-yet-onboarded owner to /onboarding.
--
-- Terms tables are accessed by the app via the SERVICE client (platform/identity
-- concern, like audit) with session-derived ids; RLS is still enabled as
-- defence — terms are world-readable (everyone must read the current terms), and
-- a user may read their own acceptances. actor/user columns are text per the
-- 0003 opaque-actor convention. REQUIRED migration for onboarding + T&C.

alter table tenants
  add column if not exists onboarding jsonb,
  add column if not exists onboarding_completed_at timestamptz;

create table if not exists terms_versions (
  id uuid primary key default gen_random_uuid(),
  version int not null unique,
  title text not null,
  body text not null,
  summary text,
  effective_date date not null,
  active boolean not null default true,
  published_by text,
  published_at timestamptz not null default now(),
  -- Phase B: "terms updated" broadcast email tracking.
  notified_at timestamptz,
  notified_count int
);
-- (idempotent add for an already-created table from an earlier 0007 paste)
alter table terms_versions add column if not exists notified_at timestamptz;
alter table terms_versions add column if not exists notified_count int;
create index if not exists idx_terms_versions_active on terms_versions (active, version desc);

create table if not exists terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users (id) on delete cascade,
  tenant_id uuid not null references tenants (id) on delete cascade,
  version int not null,
  accepted_at timestamptz not null default now(),
  ip text
);
create index if not exists idx_terms_acceptances_user on terms_acceptances (user_id, version);
create index if not exists idx_terms_acceptances_tenant on terms_acceptances (tenant_id);

alter table terms_versions enable row level security;
alter table terms_acceptances enable row level security;

-- Terms are public/world-readable (every user must be able to read the current
-- terms); only the service role writes them (platform admin publishes).
create policy terms_versions_read on terms_versions for select using (true);

-- A user may read their own acceptances; the app records them via the service
-- role (session-derived user id), which bypasses RLS.
create policy terms_acceptances_own on terms_acceptances for select
  using (user_id = auth.uid());
