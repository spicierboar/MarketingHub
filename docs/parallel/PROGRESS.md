# Orchestrator ledger

Last updated: 2026-07-11 (**W7 COMPLETE** · **WAITING ON GOOGLE FOR W6**)

**Owner lock:** Full SRS → vision · go-live = non-negotiable.  
**Schedule:** `docs/parallel/FULL-ORCHESTRATION.md`

---

## Schedule at a glance

| Wave | Status | Notes |
|------|--------|-------|
| W0–W5 | DONE | - |
| **W7** | **DONE** | fixtures **252/252 + 20/20** · `w7_complete=yes` |
| **W6** | **WAITING** | Google Cloud billing — park here |
| **`full_complete`** | no | after W6 go-live |

---

## Wave 7 — DONE

| Flag | Status |
|------|--------|
| `w7_launched` | yes |
| `m50_handoff` … `m55_handoff` | **yes** |
| `m01_final_handoff` | **yes** |
| `w7_complete` | **yes** |

**Fixtures (M01-FINAL):** self-test **252/252** · queue-test **20/20**  
**Runner:** `npx tsx scripts/run-fixtures.mjs`  
**Migrations pasted:** `0034_bookings.sql` · `0034_learning.sql`  
**Live flags:** all **OFF**

## Wave 6 — WAITING ON GOOGLE

Phase 3 Google Cloud billing blocked · Phase 4 parked · `https://mangotickle.com.au`  
When GO → OWNER-OPS + M45 → flip `PUBLISHING_LIVE` + `ADS_LIVE` + `ANALYTICS_LIVE` together.

## UX declutter (2026-07-11) — UNCOMMITTED

Dashboard + sidebar declutter in working tree (not committed):  
`dashboard/page.tsx` · `agency-ops-panel.tsx` · `app-shell.tsx`  
Primary CTA · Next up · Needs attention · Today/Create nav · Insights · More.  
Prefer `npx next dev -p 3002` · demo `/dev` + `admin@wattlegroup.dev`.

## Owner ops

Phases 1-2 done · Phase 3 Google blocked · Phase 4 parked
