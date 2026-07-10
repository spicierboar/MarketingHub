# M01-FINAL handoff — W7 integrator fixture recount (2026-07-10)

`m01_final_handoff=yes` · `w7_complete=yes`

## Fixtures (recount)

```
self-test: 252/252 ok=true
queue-test: 20/20 ok=true
```

Runner: `npx tsx scripts/run-fixtures.mjs` (updated to mirror `/api/dev/self-test` + queue-test).

## Fix applied

- `aiMos.reviewSignalProducesOpportunity` / `aiMos.loyaltySignalProducesOpportunity` failed because hash-seeded company ids no longer produced actionable simulated bundles. Tests now pass **explicit** actionable bundles (no seed luck).

## Migrations (owner)

- `0034_bookings.sql` — pasted
- `0034_learning.sql` — pasted

## Live flags

All `*_LIVE` remain **OFF**. Do not flip until W6 owner GO (Google Cloud billing → Phase 3–4 cutover).

## Next

**Wait on Google for W6.** When billing GO → OWNER-OPS + M45 verify → flip `PUBLISHING_LIVE` + `ADS_LIVE` + `ANALYTICS_LIVE` together (and other module flags per cutover plan).
