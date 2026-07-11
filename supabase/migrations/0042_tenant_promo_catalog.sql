-- Agency-authored ready-made promo campaigns (merged with the platform catalog).
alter table tenants
  add column if not exists promo_catalog jsonb;
