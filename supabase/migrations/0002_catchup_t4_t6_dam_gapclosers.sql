-- Marketing Command Centre — schema catch-up (0002).
--
-- 0001 was authored around T1–T4; the app has since added T6 (white-label
-- branding + tokenised client approval), the real-media DAM, and the
-- gap-closing batch (collaborative comments + unified social inbox). This
-- migration brings the schema level with src/lib/types.ts. Idempotent
-- (add-if-not-exists / create-if-not-exists), so it is safe to re-run.

-- ── T6 white-label: per-tenant branding (accent/logo/sender/approval message) ──
alter table tenants
  add column if not exists branding jsonb;

-- ── T6 tokenised client approval: the ClientReview record on a content item ────
alter table content_items
  add column if not exists client_review jsonb;

-- ── Company inline documents (UploadedAsset[]). The domain model / adapter
--    keep documents inline as jsonb (mirrors request uploads); company_documents
--    from 0001 stays unused. ───────────────────────────────────────────────────
alter table companies
  add column if not exists documents jsonb not null default '[]'::jsonb;

-- ── Real-media DAM: reference to the stored bytes (StoredFileRef). Bytes live
--    in the storage adapter, never in the row. ─────────────────────────────────
alter table assets
  add column if not exists stored_file jsonb;

-- ── Gap-closer: collaborative comments on a content draft ─────────────────────
-- author_id is TEXT (a user id, or "client:<email>" for external approvers), so
-- it is NOT a FK to app_users. company_id is denormalised for tenant scoping.
create table if not exists content_comments (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references content_items (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  author_id text not null,
  author_name text not null,
  author_kind text not null,               -- 'member' | 'client'
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists content_comments_content_idx on content_comments (content_id);

-- ── Gap-closer: unified social inbox mentions ─────────────────────────────────
create table if not exists social_mentions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  platform text not null,
  external_id text,                         -- platform message id (dedup on re-ingest)
  author_name text not null,
  text text not null,
  received_at timestamptz not null default now(),
  status text not null default 'new',       -- 'new' | 'drafted' | 'dismissed'
  linked_draft_id uuid references social_responses (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists social_mentions_company_idx on social_mentions (company_id);

-- ── RLS for the two new tables (company-scoped, like every other content table).
-- Comments from the no-login /approve page are written by the SERVICE client
-- (the external client has no auth session), so the write policy here governs the
-- internal, signed-in path; the service client bypasses RLS for the client path.
alter table content_comments enable row level security;
alter table social_mentions  enable row level security;

drop policy if exists cc_rw on content_comments;
create policy cc_rw on content_comments for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));

drop policy if exists sm_rw on social_mentions;
create policy sm_rw on social_mentions for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
