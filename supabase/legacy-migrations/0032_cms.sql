-- 0032 - Website CMS (W4 M34): pages, versions, SEO metadata, update requests.

create table if not exists cms_pages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  slug text not null,
  title text not null,
  kind text not null default 'page',
  status text not null default 'draft',
  current_version_id uuid,
  published_version_id uuid,
  live_url text,
  created_by uuid references app_users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, slug)
);

create table if not exists cms_page_versions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references cms_pages (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  version_number int not null,
  title text not null,
  body_html text not null default '',
  change_summary text,
  status text not null default 'draft',
  created_by uuid references app_users (id),
  created_at timestamptz not null default now(),
  approved_by uuid references app_users (id),
  approved_at timestamptz,
  unique (page_id, version_number)
);

create table if not exists cms_seo_metadata (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references cms_pages (id) on delete cascade unique,
  company_id uuid not null references companies (id) on delete cascade,
  meta_title text not null default '',
  meta_description text not null default '',
  og_title text,
  og_description text,
  og_image_url text,
  canonical_url text,
  no_index boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cms_update_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  page_id uuid references cms_pages (id) on delete set null,
  title text not null,
  description text not null default '',
  status text not null default 'open',
  requested_by uuid references app_users (id),
  assigned_to uuid references app_users (id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table cms_pages enable row level security;
alter table cms_page_versions enable row level security;
alter table cms_seo_metadata enable row level security;
alter table cms_update_requests enable row level security;

drop policy if exists cms_pages_scoped on cms_pages;
create policy cms_pages_scoped on cms_pages for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));

drop policy if exists cms_page_versions_scoped on cms_page_versions;
create policy cms_page_versions_scoped on cms_page_versions for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));

drop policy if exists cms_seo_metadata_scoped on cms_seo_metadata;
create policy cms_seo_metadata_scoped on cms_seo_metadata for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));

drop policy if exists cms_update_requests_scoped on cms_update_requests;
create policy cms_update_requests_scoped on cms_update_requests for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));
