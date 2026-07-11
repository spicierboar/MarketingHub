# Orchestrator ledger

Last updated: 2026-07-11 (**W7 DONE** · **AI CAMPAIGN LAYER + DEFERRED READY** · **W6 WAITING ON GOOGLE**)

**Owner lock:** Full SRS → vision · go-live = non-negotiable.  
**Schedule:** `docs/parallel/FULL-ORCHESTRATION.md`

---

## Schedule at a glance

| Wave | Status | Notes |
|------|--------|-------|
| W0–W5 | DONE | - |
| **W7** | **DONE** | fixtures **252/252 + 20/20** · `w7_complete=yes` |
| **W6** | **WAITING** | Google Cloud billing — park live cutover |
| **`full_complete`** | no | after W6 go-live |

---

## Wave 7 — DONE

| Flag | Status |
|------|--------|
| `w7_launched` | yes |
| `m50_handoff` … `m55_handoff` | **yes** |
| `m01_final_handoff` | **yes** |
| `w7_complete` | **yes** |

**Fixtures (M01-FINAL baseline):** self-test **252/252** · queue-test **20/20**  
**Runner:** `npx tsx scripts/run-fixtures.mjs`  
**Migrations pasted:** `0034_bookings.sql` · `0034_learning.sql` · **`0035_ai_campaign_layer.sql`** · **`_owner_paste_0036_0037_batch.sql`** (RBAC + experiments + privacy)  
**Live flags:** all **OFF**

## Wave 6 — WAITING ON GOOGLE

Phase 3 Google Cloud billing blocked · Phase 4 parked · `https://mangotickle.com.au`  
When GO → OWNER-OPS + M45 → flip `PUBLISHING_LIVE` + `ADS_LIVE` + `ANALYTICS_LIVE` together.

## Committed on main (this session arc)

| Commit | Summary |
|--------|---------|
| `ddbda68` | Move client tools into company workspace; slim agency sidebar |
| `ea7bfbf` | Show company tools by business type and add-ons |

**HEAD:** `ea7bfbf` · ahead of origin by **8**

## UNCOMMITTED (large — commit when owner asks)

- AI campaign layer (orchestrator, recs, policies, prompt registry, UI, docs)
- Deferred: `/ai-prompts`, RBAC capabilities, calendar DnD, experiments, `/privacy`, connector matrix, spend gate
- Company lifecycle list · `?company=` filter pass · approvals assist · email/SMS AI draft · schedule-at-best-time
- Prefer `npx next dev -p 3002` · demo `/dev` + `admin@wattlegroup.dev`
- **Exclude:** `scripts/*-isolation*`, `resolve-*.mjs`, `_owner_paste_*`, `temp-route-ours.ts`

## Owner ops

Phases 1-2 done · Phase 3 Google blocked · Phase 4 parked
