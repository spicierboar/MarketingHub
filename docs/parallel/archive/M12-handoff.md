# M12 — Agency ops slice handoff (2026-07-08)

## Shipped

- **Engine:** `src/lib/agency-ops.ts`
  - `detectOverdueApprovalAlerts()` — content in `pending_approval` beyond threshold (default 3 days) + overdue client sign-off (`clientReview.status === "pending"`, default 5 days)
  - `buildWorkloadSummary()` — portfolio totals + per-company breakdown (approvals, open requests, health)
  - `healthAttentionAlerts()` + `mergeAgencyAlerts()` — wires `companiesNeedingAttention()` from M10 health scores
  - Reusable **agency content templates** — tenant-wide `prompt_templates` (`companyId` null); `agencyTemplateInput()`, `templateToRequestParams()`, `listAgencyContentTemplates()`
  - `buildAgencyOpsBundle()` — single tenant-scoped loader for dashboard
- **UI**
  - `src/components/agency-ops-panel.tsx` — workload strip, alerts list, health attention, template library (create + apply)
  - `/dashboard` — admin **Agency operations** section (replaces standalone health card)
  - `src/app/(app)/dashboard/actions.ts` — `createAgencyTemplateAction`, `applyAgencyTemplateAction` → `/requests/new` prefill
  - `/requests/new` — accepts `audience` + `platform` query prefill from template apply
- **Seed:** two tenant-wide templates on `t_bright` (BrightSpark) in `store.ts`
- **Self-test:** +3 in `src/lib/selftest/agency-ops.ts`
  - `agencyOps.overdueApprovalDetected`
  - `agencyOps.workloadSummaryTotals`
  - `agencyOps.templateApplyPrefill`

## Migration

**None required** — templates reuse existing `prompt_templates` table; alerts/workload are compute-only from content, requests, and health scores. Slot **0025** remains reserved.

## Do not touch (parallel modules)

- `src/lib/ai-mos.ts` (M11)
- `src/lib/publish-queue.ts`
- `HANDOVER.md` — integrator updates after batch 5

## Verified (2026-07-08)

```powershell
cd F:/MarketingHub/command-centre
npx tsc --noEmit          # clean
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run build             # clean
npx tsx scripts/run-fixtures.mjs
# self-test 52/52 + queue-test 18/18 (est. +3 from M12)
```

M12-specific fixture delta: **+3** agency ops checks (49 → 52 post-batch-4 baseline).

## Next module

V1 module 13 of 15 — Auto-onboarding (site/social scrape)
