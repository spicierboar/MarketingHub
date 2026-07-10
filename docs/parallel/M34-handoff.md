m34_handoff=yes

## Branch
`w4/m34-cms` (from `main` @ 05fa050)

## Files shipped
- `src/lib/cms.ts` — core CMS engine (drafts, versions, review/approve/publish, SEO, update requests, import)
- `src/lib/cms-connectors.ts` — `CMS_LIVE` / `CMS_API_KEY` / `CMS_API_URL` gate; simulated publish/import
- `src/app/(app)/cms/page.tsx` — admin UI
- `src/app/(app)/cms/actions.ts` — server actions
- `supabase/migrations/0032_cms.sql` — company-scoped RLS tables
- `src/lib/selftest/cms.ts` — 7 isolation helpers + `runCmsSelfTest()`
- `src/lib/db/index.ts` — `listCmsPageVersionsForPage` helper (CMS section from integrator base)
- `src/lib/db/supabase-adapter.ts` — CMS CRUD block

## Integrator base (pre-committed on 05fa050)
- `src/lib/types.ts` — CMS entity types
- `src/lib/db/store.ts` — seed arrays (`c_motel` demo pages)
- `src/lib/selftest/isolation.ts` — `cms.*` check group
- `src/components/app-shell.tsx` — "Website CMS" nav → `/cms`
- `src/app/api/dev/self-test/route.ts` — `runCmsSelfTest()` wired

## Migration
`0032_cms.sql`

## Fixture delta
+7 CMS checks → **131/131** (with M35 funnel + M36 marketing-automation selftests present on tree)

## Hard locks
- `CMS_LIVE` **not** flipped (simulated import/publish default)
- Did **not** touch `PUBLISHING_LIVE`, `ADS_LIVE`, `ANALYTICS_LIVE`, `SMS_LIVE`, `CRM_LIVE`, etc.
- Did **not** edit `HANDOVER.md`
- Did **not** commit funnel / workflows / marketing-automation module files (M35/M36 ownership)

## Verification
- `npx tsc --noEmit` — pass (worktree)
- `npx tsx scripts/run-fixtures.mjs` — **131/131**
- `npm run build` — run from primary worktree with `node_modules` (junction breaks Turbopack)

## Notes
- Removed premature `supabaseRepo.*Funnel*` calls from `index.ts` funnel stubs until M35 ships adapter methods (memory store only).
- Parallel W4 agents share the repo; use git worktree `command-centre-m34` for isolated M34 work.
