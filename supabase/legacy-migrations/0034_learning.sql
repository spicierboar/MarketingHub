-- W7 M55: Continuous learning register (hypotheses + lessons-learned).

create table if not exists learning_hypotheses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  title text not null,
  statement text not null,
  metric text,
  status text not null default 'open',
  experiment_outcome text default 'pending',
  outcome_notes text,
  source_recommendation_type text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists learning_lessons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  source text not null,
  title text not null,
  lesson text not null,
  recommendation_type text,
  dismiss_reason text,
  hypothesis_id uuid references learning_hypotheses (id) on delete set null,
  created_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists learning_hypotheses_tenant_idx on learning_hypotheses (tenant_id);
create index if not exists learning_hypotheses_company_idx on learning_hypotheses (company_id);
create index if not exists learning_lessons_tenant_idx on learning_lessons (tenant_id);
create index if not exists learning_lessons_company_idx on learning_lessons (company_id);

alter table learning_hypotheses enable row level security;
alter table learning_lessons enable row level security;

drop policy if exists learning_hypotheses_scoped on learning_hypotheses;
create policy learning_hypotheses_scoped on learning_hypotheses for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));

drop policy if exists learning_lessons_scoped on learning_lessons;
create policy learning_lessons_scoped on learning_lessons for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
