-- 0015 — AI assistant hardening (Module 3).
-- Token tracking on ai_runs; critique + cost metadata on content; AI provenance on assets.

alter table ai_runs
  add column if not exists input_tokens int not null default 0,
  add column if not exists output_tokens int not null default 0,
  add column if not exists context_chars int;

alter table content_items
  add column if not exists ai_run_id uuid references ai_runs (id) on delete set null,
  add column if not exists est_cost_usd numeric(10, 6),
  add column if not exists ai_critique jsonb;

alter table assets
  add column if not exists ai_model text,
  add column if not exists ai_prompt text,
  add column if not exists ai_run_id uuid references ai_runs (id) on delete set null,
  add column if not exists est_cost_usd numeric(10, 6),
  add column if not exists sources_used text[] not null default '{}';

create index if not exists idx_ai_runs_tenant_month on ai_runs (tenant_id, created_at);
