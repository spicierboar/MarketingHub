-- 0046 — Legal docs kind: Terms & Conditions + Privacy Policy (2026-07-14).
--
-- Extends the platform-level terms_versions / terms_acceptances tables (0007)
-- so the same versioned publish → email → force-reaccept flow covers BOTH
-- Terms of Service and Privacy Policy. `kind` is 'terms' | 'privacy'; each
-- kind has its own monotonic version sequence and at most one active row
-- (enforced by the app publish path, same as 0007).
--
-- Existing rows default to kind='terms' — the login gate continues to enforce
-- T&Cs; Privacy only gates once an agency publishes a privacy version.
--
-- Owner paste (staging): notepad this file OR
--   supabase/migrations/_owner_paste_0046_legal_docs_kind.sql

alter table terms_versions
  add column if not exists kind text not null default 'terms';

-- Constrain kind once the column exists (idempotent via drop+add).
alter table terms_versions drop constraint if exists terms_versions_kind_check;
alter table terms_versions
  add constraint terms_versions_kind_check check (kind in ('terms', 'privacy'));

-- version was globally unique; now unique per kind.
alter table terms_versions drop constraint if exists terms_versions_version_key;
drop index if exists terms_versions_version_key;
create unique index if not exists terms_versions_kind_version_uidx
  on terms_versions (kind, version);

drop index if exists idx_terms_versions_active;
create index if not exists idx_terms_versions_kind_active
  on terms_versions (kind, active, version desc);

alter table terms_acceptances
  add column if not exists kind text not null default 'terms';

alter table terms_acceptances drop constraint if exists terms_acceptances_kind_check;
alter table terms_acceptances
  add constraint terms_acceptances_kind_check check (kind in ('terms', 'privacy'));

drop index if exists idx_terms_acceptances_user;
create index if not exists idx_terms_acceptances_user_kind
  on terms_acceptances (user_id, kind, version);
