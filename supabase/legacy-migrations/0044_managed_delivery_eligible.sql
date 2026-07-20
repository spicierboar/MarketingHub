-- 0044_managed_delivery_eligible.sql
-- 6h eligibility floor + implementation-plan email idempotency stamp.
-- Owner paste into Supabase SQL editor.
-- Requires: 0038_managed_delivery.sql

alter table managed_delivery_runs
  add column if not exists strategy_eligible_at timestamptz;

alter table managed_delivery_runs
  add column if not exists implementation_plan_emailed_at timestamptz;

alter table managed_delivery_runs
  add column if not exists enqueue_reason text;

-- Backfill: legacy runs become eligible 6h after onboarding.
update managed_delivery_runs
set strategy_eligible_at = onboarding_completed_at + interval '6 hours'
where strategy_eligible_at is null;

comment on column managed_delivery_runs.strategy_eligible_at is
  'Do not start generating until now >= this (onboard + 6h; package_change may be immediate). SLA ceiling remains strategy_due_at.';

comment on column managed_delivery_runs.implementation_plan_emailed_at is
  'Idempotency stamp for client implementation-plan email after strategy+calendar.';

comment on column managed_delivery_runs.enqueue_reason is
  'signup | onboarding | service_level | package_change | manual';
