-- 0030 -- Module 6: platform campaign id for live Google Ads / Meta sync.
--
-- When ADS_LIVE is on, create/pause/adjust flows store the delegated account's
-- campaign id here so reporting + status sync can target the right object.
-- Optional/null while simulated -- app degrades gracefully pre-paste.

alter table ad_campaigns
  add column if not exists external_campaign_id text;

create index if not exists idx_ad_campaigns_external
  on ad_campaigns (external_campaign_id)
  where external_campaign_id is not null;
