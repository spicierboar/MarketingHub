-- Actor/creator/approver columns → text (SaaS runtime fix).
--
-- The domain treats actor ids as OPAQUE STRINGS: a real user is a uuid, but the
-- app also uses synthetic actors — "system:cron" (scheduler/automation),
-- "client:<email>" (no-login client approval), and "anon" (failed-login audit).
-- 0001 modelled every *_by / actor_id / user_id as `uuid references app_users`,
-- which rejects those synthetic ids under Supabase (invalid uuid / FK violation),
-- silently breaking the cron, automation writes, client approvals, and audit.
--
-- Fix: make these opaque-actor columns `text` (drop the FK, keep the value).
-- STRUCTURAL membership columns stay uuid FKs: app_users.id, tenant_members.user_id,
-- company_access.user_id (those are always real users). No RLS policy references
-- any converted column (RLS uses auth.uid() + joins), so this is isolation-safe.
-- Idempotent: drop-constraint-if-exists + alter-to-text is a no-op if already text.

do $$
declare
  col record;
begin
  for col in
    select * from (values
      ('companies','created_by'),
      ('company_documents','uploaded_by'),
      ('marketing_requests','requester_id'),
      ('marketing_requests','assigned_reviewer_id'),
      ('content_items','created_by'),
      ('content_items','approved_by'),
      ('social_responses','created_by'),
      ('social_responses','approved_by'),
      ('audit_logs','actor_id'),
      ('knowledge_documents','added_by'),
      ('knowledge_gaps','answered_by'),
      ('consents','approved_by'),
      ('evidence','created_by'),
      ('ai_runs','user_id'),
      ('campaigns','created_by'),
      ('campaigns','approved_by'),
      ('prompt_templates','created_by'),
      ('scheduled_posts','created_by'),
      ('publishing_integrations','connected_by'),
      ('publish_logs','actor_id'),
      ('utm_links','created_by'),
      ('recommendations','created_by'),
      ('tasks','created_by'),
      ('security_settings','updated_by'),
      ('legal_holds','applied_by'),
      ('legal_holds','released_by'),
      ('assets','created_by'),
      ('assets','approved_by'),
      ('brand_templates','created_by'),
      ('automation_settings','updated_by'),
      ('automation_runs','triggered_by')
    ) as t(tbl, colname)
  loop
    -- Drop the inline FK (Postgres names it <table>_<column>_fkey) if present.
    execute format('alter table %I drop constraint if exists %I',
                   col.tbl, col.tbl || '_' || col.colname || '_fkey');
    -- Convert uuid → text (no-op if already text).
    execute format('alter table %I alter column %I type text using %I::text',
                   col.tbl, col.colname, col.colname);
  end loop;
end $$;
