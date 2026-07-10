-- 0033 - Full RAG (W5 M40): versioned knowledge sources + versions.

create table if not exists rag_knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  title text not null,
  source_type text not null default 'other',
  status text not null default 'draft',
  current_version_id uuid,
  approved_version_id uuid,
  added_by text references app_users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists rag_knowledge_versions (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references rag_knowledge_sources (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  version_number int not null,
  title text not null,
  content text not null default '',
  status text not null default 'draft',
  file_name text,
  content_type text,
  superseded_by_id uuid references rag_knowledge_versions (id) on delete set null,
  created_by text references app_users (id),
  created_at timestamptz not null default now(),
  approved_by text references app_users (id),
  approved_at timestamptz,
  unique (source_id, version_number)
);

alter table rag_knowledge_sources enable row level security;
alter table rag_knowledge_versions enable row level security;

drop policy if exists rag_knowledge_sources_scoped on rag_knowledge_sources;
create policy rag_knowledge_sources_scoped on rag_knowledge_sources for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));

drop policy if exists rag_knowledge_versions_scoped on rag_knowledge_versions;
create policy rag_knowledge_versions_scoped on rag_knowledge_versions for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
