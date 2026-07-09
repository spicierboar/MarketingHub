-- 0030 -- Module 6: platform campaign id for live Google Ads / Meta sync.
alter table ad_campaigns
  add column if not exists external_campaign_id text;
create index if not exists idx_ad_campaigns_external
  on ad_campaigns (external_campaign_id)
  where external_campaign_id is not null;