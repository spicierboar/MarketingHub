-- quality_routing was used in app code (submit → Approvals) but never migrated.
-- Without this column, content_items UPDATE patches that include quality_routing
-- fail under PostgREST; updateContent previously ignored the error, so status
-- stayed ai_draft and Approvals stayed empty after a "successful" submit.

alter table public.content_items
  add column if not exists quality_routing jsonb;

comment on column public.content_items.quality_routing is
  'Managed-service quality gate + routing decision (pass/warn/fail/escalate → client or agency queue).';

grant insert (quality_routing) on table public.content_items to anon, authenticated, service_role;
grant select (quality_routing) on table public.content_items to anon, authenticated, service_role;
grant update (quality_routing) on table public.content_items to anon, authenticated, service_role;
grant references (quality_routing) on table public.content_items to anon, authenticated, service_role;
