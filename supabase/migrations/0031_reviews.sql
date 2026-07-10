-- 0031 - Review management (W3 M33): imported reviews + review-request campaigns.

create table company_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  platform text not null,
  external_id text,
  author_name text not null,
  rating smallint not null check (rating between 1 and 5),
  body text not null default '',
  reviewed_at timestamptz not null,
  sentiment text not null,
  topics text[] not null default '{}',
  urgency text not null,
  escalation_required boolean not null default false,
  status text not null default 'new',
  draft_response text,
  published_response text,
  imported_at timestamptz not null default now(),
  responded_at timestamptz,
  created_by uuid references app_users (id)
);

create unique index if not exists idx_company_reviews_external
  on company_reviews (company_id, platform, external_id)
  where external_id is not null;

create table review_request_campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  name text not null,
  channel text not null,
  status text not null default 'draft',
  message_template text not null,
  target_segment text,
  sent_count int not null default 0,
  click_count int not null default 0,
  review_count int not null default 0,
  created_by uuid references app_users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_at timestamptz
);

alter table company_reviews enable row level security;
alter table review_request_campaigns enable row level security;

create policy company_reviews_scoped on company_reviews for select
  using (has_company_access(company_id));
create policy company_reviews_write on company_reviews for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));

create policy review_campaigns_scoped on review_request_campaigns for select
  using (has_company_access(company_id));
create policy review_campaigns_write on review_request_campaigns for all
  using (has_company_access(company_id)) with check (has_company_access(company_id));