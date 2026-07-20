-- 0028 — Portal client flag + field-sales provisioning (W1 M23, 2026-07-09).
--
-- Adds explicit portal_only on tenant_members so field-sales provisioning can
-- mark client logins without relying on inference alone. App RBAC uses the flag
-- when set; otherwise infers portal users from member + single company_access.
-- Degrades gracefully pre-migration (inference path only). Idempotent.

alter table tenant_members
  add column if not exists portal_only boolean not null default false;

comment on column tenant_members.portal_only is
  'Client-portal login (field sales). When true, app treats member as portal user; else infers from single company_access.';
