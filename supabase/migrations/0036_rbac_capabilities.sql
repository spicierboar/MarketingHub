-- Additive RBAC capabilities on tenant_members (optional jsonb).
-- Safe to re-run. Does not change owner/admin/member role semantics.

alter table tenant_members
  add column if not exists capabilities jsonb not null default '[]'::jsonb;

comment on column tenant_members.capabilities is
  'Optional permission strings (see src/lib/rbac-matrix.ts). Empty = legacy isAdmin/isOwner fallback.';
