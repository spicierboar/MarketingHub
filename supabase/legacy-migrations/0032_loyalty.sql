create table if not exists loyalty_programs (
  company_id uuid primary key references companies (id) on delete cascade,
  reward_mode text not null default 'points',
  points_per_dollar numeric not null default 1,
  stamps_per_reward integer not null default 10,
  referral_bonus_points integer not null default 50,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists loyalty_tiers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  name text not null,
  threshold_points integer not null default 0,
  benefits text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists loyalty_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  contact_id uuid references crm_contacts (id) on delete set null,
  email text,
  display_name text not null,
  points_balance integer not null default 0,
  stamps_balance integer not null default 0,
  tier_id uuid references loyalty_tiers (id) on delete set null,
  referral_code text not null,
  referred_by_code text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists loyalty_coupons (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  code text not null,
  name text not null,
  kind text not null default 'percent_off',
  value numeric not null default 0,
  segment_tag text,
  max_redemptions integer,
  per_member_limit integer not null default 1,
  min_spend numeric,
  expires_at timestamptz,
  channels jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  redemption_count integer not null default 0,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists loyalty_referrals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  referrer_member_id uuid not null references loyalty_members (id) on delete cascade,
  referee_email text not null,
  status text not null default 'pending',
  bonus_awarded integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists loyalty_redemptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  member_id uuid not null references loyalty_members (id) on delete cascade,
  coupon_id uuid not null references loyalty_coupons (id) on delete cascade,
  amount_off numeric not null default 0,
  mode text not null default 'simulated',
  abuse_flagged boolean not null default false,
  abuse_reason text,
  redeemed_at timestamptz not null default now()
);

alter table loyalty_programs enable row level security;
drop policy if exists loyalty_programs_rw on loyalty_programs;
create policy loyalty_programs_rw on loyalty_programs for all using (has_company_access(company_id)) with check (has_company_access(company_id));

alter table loyalty_tiers enable row level security;
drop policy if exists loyalty_tiers_rw on loyalty_tiers;
create policy loyalty_tiers_rw on loyalty_tiers for all using (has_company_access(company_id)) with check (has_company_access(company_id));

alter table loyalty_members enable row level security;
drop policy if exists loyalty_members_rw on loyalty_members;
create policy loyalty_members_rw on loyalty_members for all using (has_company_access(company_id)) with check (has_company_access(company_id));

alter table loyalty_coupons enable row level security;
drop policy if exists loyalty_coupons_rw on loyalty_coupons;
create policy loyalty_coupons_rw on loyalty_coupons for all using (has_company_access(company_id)) with check (has_company_access(company_id));

alter table loyalty_referrals enable row level security;
drop policy if exists loyalty_referrals_rw on loyalty_referrals;
create policy loyalty_referrals_rw on loyalty_referrals for all using (has_company_access(company_id)) with check (has_company_access(company_id));

alter table loyalty_redemptions enable row level security;
drop policy if exists loyalty_redemptions_rw on loyalty_redemptions;
create policy loyalty_redemptions_rw on loyalty_redemptions for all using (has_company_access(company_id)) with check (has_company_access(company_id));
