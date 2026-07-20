-- 0012 — Paid-ad lead webhook idempotency (Module 6).
--
-- Live Meta Lead Ads + Google lead-form webhooks may redeliver the same lead;
-- external_lead_id is the platform's stable id, unique per (company, platform).
-- Nullable so manual leads (recordLeadAction) stay unchanged.

alter table leads add column if not exists external_lead_id text;

create unique index if not exists idx_leads_external_dedup
  on leads (company_id, platform, external_lead_id)
  where external_lead_id is not null;
