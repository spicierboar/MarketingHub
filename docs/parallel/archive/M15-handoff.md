# M15 — Security slice handoff (2026-07-08)

## Shipped

- **Engine:** `src/lib/security-slice.ts`
  - `sanitizeAiUserInput()` — strips common prompt-injection phrases; max-length cap
  - `tenantScopedSystemPrompt()` — tenant/company fence on system prompts
  - `guardedClaudeCall()` — sanitize user text + tenant fence + failure recording (does not bypass metering/critique)
  - `recordProviderFailure()` / `getLastProviderFailure()` — in-memory last-failure registry
  - `buildIntegrationHealthBundle()` — AI provider + publishing/ads/analytics/visuals gates with simulated hints when live off
- **AI wiring (thin hooks)**
  - `src/lib/ai/draft.ts` — sanitize user fields; `guardedClaudeCall` for drafts + campaign ideas
  - `src/lib/ai/campaign-builder.ts` — sanitize goal; `guardedClaudeCall` in Claude path
  - `src/lib/ai-mos.ts` — sanitize campaign goal on opportunity convert
- **UI**
  - `src/components/security-health-panel.tsx` — integration status table
  - `/admin` — Integration health panel (Support Console)
  - `/ai-control` — AI & integration health panel + guardrail line for injection filtering
- **Self-test:** +3 in `src/lib/selftest/security-slice.ts`
  - `securitySlice.injectionPatternsStripped`
  - `securitySlice.tenantContextFence`
  - `securitySlice.providerFailureRecorded`

## Migration

**None required** — failure registry and health bundle are compute-only / in-process. Slot **0028** remains reserved.

## Do not touch (parallel modules)

- `src/lib/auto-onboarding.ts` (M13)
- `src/lib/publish-queue.ts`
- `HANDOVER.md` — integrator updates after batch 6

## Verified (2026-07-08)

```powershell
cd F:/MarketingHub/command-centre
npx tsc --noEmit          # clean
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run build             # clean
npx tsx scripts/run-fixtures.mjs
# self-test 61/61 + queue-test 18/18 (est. +3 from M15)
```

M15-specific fixture delta: **+3** security slice checks (58 → 61 with parallel M13 checks on branch).

## Next module

V1 module 13 of 15 — Auto-onboarding (parallel with M15; integrator merges batch 6)
