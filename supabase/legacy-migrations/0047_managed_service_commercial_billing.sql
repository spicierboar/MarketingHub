-- 0047 — managed-service commercial packages and durable Stripe event ledger.
-- Company service billing remains co-located with the company profile so every
-- entitlement read is company-scoped and existing RLS continues to apply.

create table if not exists stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

alter table stripe_webhook_events enable row level security;
-- No browser/user policy: only the service-role webhook repository may access it.
revoke all on table stripe_webhook_events from anon, authenticated;

-- Preserve existing assignments while moving legacy package ids to the current
-- Starter/Growth/Managed names. Custom was never a current commercial SKU and
-- migrates to Growth as the closest practical entitlement.
update companies
set profile = jsonb_set(
  profile,
  '{managedService,marketingPackageId}',
  to_jsonb(
    case profile #>> '{managedService,marketingPackageId}'
      when 'blast' then 'managed'
      when 'managed' then 'managed'
      when 'pro' then 'growth'
      when 'custom' then 'growth'
      when 'growth' then 'growth'
      else 'starter'
    end
  ),
  true
)
where profile ? 'managedService';

-- Seed durable lifecycle state without overwriting companies already written by
-- the new application code.
update companies
set profile = jsonb_set(
  profile,
  '{managedService,serviceBilling}',
  jsonb_build_object(
    'status', case
      when coalesce((profile #>> '{managedService,packageChangePendingBilling}')::boolean, false)
        then 'pending_payment'
      else 'active'
    end,
    'activePackageId', profile #>> '{managedService,marketingPackageId}',
    'serviceOptions', jsonb_build_object(
      'searchVisibility',
        (profile #>> '{managedService,marketingPackageId}') = 'managed',
      'websiteConnectionSetup', true,
      'websitePublishing', false,
      'hostedLandingPage', false,
      'monthlyAdCapAud', 0
    )
  ),
  true
)
where profile ? 'managedService'
  and not ((profile #> '{managedService}') ? 'serviceBilling');

create index if not exists idx_stripe_webhook_events_processed_at
  on stripe_webhook_events (processed_at);
