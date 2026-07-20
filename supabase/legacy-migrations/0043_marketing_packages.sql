-- Agency overrides for company marketing package SKUs (Basic / Pro / Blast / Custom).
-- Company assignment lives in companies.profile jsonb → managedService.marketingPackageId
-- (+ customModules); no new companies column required.
alter table tenants
  add column if not exists marketing_package_catalog jsonb;
