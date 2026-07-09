# M05 — Content repurposing handoff (2026-07-08)

## Shipped

- **Engine:** `src/lib/content-repurposing.ts`
  - One source brief → platform-specific variants for v1 platforms only: Facebook, Instagram, Google Business Profile, TikTok
  - Platform-aware length limits, tone, CTA, and format hints (TikTok video-first script, GBP local, etc.)
  - Deterministic templates when `ANTHROPIC_API_KEY` unset; live Claude + `draftContent` when configured
  - `canRepurposeSource()` — draft (`ai_draft`, `user_edited`, `changes_required`) or `approved` only
- **UI:** `src/app/(app)/studio/page.tsx` — “Repurpose for platforms” panel (source picker + platform checkboxes)
- **Action:** `src/app/(app)/studio/actions.ts` — `repurposeForPlatformsAction`
  - Tenant-pinned via `assertCompanyAccess(source.companyId)`
  - Creates child `social_post` rows with `repurposedFromId`, `variantGroupId`, `variantLabel` (platform name)
  - **Governance:** all variants start as `ai_draft` — never auto-published
  - **Duplicate warnings:** `duplicateWarning()` on each variant (Module 3 pattern preserved alongside studio drafts)
- **Link:** `src/app/(app)/content/[id]/page.tsx` → `/studio?repurposeFrom={id}` for eligible draft/approved content
- **Self-test:** +4 checks in `src/lib/selftest/isolation.ts` (helpers in `src/lib/selftest/repurposing.ts`)
  - `repurpose.sourceEligibility`
  - `repurpose.platformVariantsDistinct`
  - `repurpose.charLimitsRespected`
  - `repurpose.createsAiDraftLinked`
  - **Fixture total:** 35/35 self-test (+4 from prior baseline)

## Migration

**None required.** Existing schema columns suffice:

- `repurposed_from_id` (parent lineage)
- `variant_group_id` + `variant_label` (platform variant grouping)

**Slot `0018_*` reserved/unused** — no `supabase/migrations/0018_content_repurposing.sql` shipped.

## Do not touch (parallel modules)

- `src/lib/business-profiles.ts`, `companies/**` (M02)
- `src/app/(app)/calendar/**` except read-only imports (M04)
- `HANDOVER.md` (owner updates separately)

## Verify

```powershell
cd F:/MarketingHub/command-centre
npx tsc --noEmit
Remove-Item -Recurse -Force .next; npm run build
npx tsx scripts/run-fixtures.mjs
# expect self-test 35/35 (+4 repurpose) + queue-test 18/18
# (rename/remove .env.local first if Supabase TLS blocks in-memory fixtures)
```

## Next module

V1 module 6 of 15 — GBP local audit slice
