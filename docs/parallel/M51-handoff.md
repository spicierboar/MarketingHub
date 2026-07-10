# M51 — Local SEO (full) handoff (2026-07-10)

**Agent:** M51-W7-LocalSEO · **Branch:** `main`

`m51_handoff=yes`

## Shipped

- `src/lib/local-seo-connectors.ts` — `localSeoLive()` gated on `LOCAL_SEO_LIVE` + `appEnv()` (staging never honours)
- `src/lib/local-seo.ts` — suburb landing briefs, schema JSON-LD recommendations (LocalBusiness/Restaurant/Hotel/FAQ), governed Q&A draft specs + `spawnLocalSeoQaDraft` → `ai_draft` FAQ rows, combined local SEO score (GBP 50% + landing 25% + schema 25%)
- `src/components/local-seo-panel.tsx` — score, landing briefs, schema, Q&A panels
- `src/app/(app)/companies/[id]/local-seo/page.tsx` — extended UI (GBP audit panel retained)
- `src/app/(app)/companies/[id]/local-seo/actions.ts` — Accept → ai_draft server action
- Self-test `src/lib/selftest/local-seo.ts` (~3 checks; parent wires `/api/dev/self-test`)
- **No migration** (compute-only)
- **No agency hub** `/local-seo` nav — company page only (avoided `app-shell.tsx` edit)

## Gate

`LOCAL_SEO_LIVE` — **off by default**. When off, report `mode=simulated` and landing readiness uses deterministic drift. When on (non-staging), draft spawn tags `aiModel=local-seo-live`. GBP live reads remain on existing `gbpAuditLive()` / `PUBLISHING_LIVE` — unchanged.

## Verify

```bash
cd command-centre
npx tsc --noEmit
```

Self-test (after parent wires route):

```bash
curl http://localhost:3000/api/dev/self-test
# checks: localSeo.landingBriefs, localSeo.schemaRecs, localSeo.simulatedWhenLiveOff
```

UI: `/companies/{id}/local-seo` (admin) — score card, landing briefs, schema JSON-LD, Q&A Accept → ai_draft, existing GBP audit below.

## Next

- Owner wires self-test keys in `/api/dev/self-test` (do not flip `LOCAL_SEO_LIVE` until enrichment paths are production-ready).
- Optional fan-in: extend `exec-dash` local SEO card to use `report.score.overall` instead of GBP-only.
