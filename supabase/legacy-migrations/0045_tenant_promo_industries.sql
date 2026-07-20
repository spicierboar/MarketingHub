-- Tenant-scoped custom promo industries (merged with platform options).
alter table tenants
  add column if not exists promo_industries jsonb;
