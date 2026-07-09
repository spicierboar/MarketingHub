# M21 — Local area intelligence panel handoff (2026-07-09)

**Agent:** M21-W1-IntelPanel · **Branch:** `w1/m21-intel-panel`

## Shipped (§22 intel panel on `/companies/[id]`)

- **`src/lib/local-area-intel.ts`** — `localIntelCompleteness`, `localIntelSummary`, `localIntelHighlights`, `buildLocalIntelAiContext` (mirrors `business-profiles` pattern).
- **`local-intel-panel.tsx`** — summary strip + completeness score + key-field editor on company onboarding page.
- **`local-intel-fields.tsx`** — shared form fields (`variant="key"` on company page, `variant="full"` on Brand Brain).
- **`/companies/[id]`** — `LocalIntelPanel` card between Business & market and Brand & compliance; loads `getLocalProfile`.
- **`saveLocalProfileAction`** — `intelScope=key` merges extended fields (demographics, seasonal) when saving from company page; revalidates both routes.
- **`ai/draft.ts`** — uses `buildLocalIntelAiContext` (adds competitors, search terms, common needs).
- **Self-test** — `localIntel.completenessAndSummary`, `localIntel.keyScopePreservesExtended`.

## Migration

**None.** Reuses existing `local_area_profiles` table / in-memory store.

## Verified

```powershell
cd F:/MarketingHub/command-centre
npx tsc --noEmit
npm run build
```

## Flags

- `m21_handoff=yes` in PROGRESS.md
- No migration 0028 · live flags unchanged · `/client/reports` untouched (M20)

## Fan-in

Ready for **M01-W1** merge order: m23 → m20 → **m21** → m22.
