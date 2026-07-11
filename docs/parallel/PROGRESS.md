# Orchestrator ledger

Last updated: 2026-07-11 (**MANAGED-SERVICE WAVE 3 DONE** · **W6 WAITING ON GOOGLE**)

**Owner lock:** Full SRS → vision · go-live = non-negotiable.  
**Schedule:** `docs/parallel/FULL-ORCHESTRATION.md`  
**Model:** `docs/MANAGED-SERVICE-MODEL.md`  
**Pending:** `docs/MANAGED-SERVICE-PENDING.md`

---

## Schedule at a glance

| Wave | Status | Notes |
|------|--------|-------|
| W0–W5 | DONE | - |
| **W7** | **DONE** | `w7_complete=yes` |
| **Managed service** | **WAVE 3 DONE** | auto-schedule · Help · Payments C1 · PENDING parked |
| **W6** | **WAITING** | Google Cloud billing — park live cutover |
| **`full_complete`** | no | after W6 go-live |

---

## Managed service

- Service levels + C1 payments locked in model doc
- Delivery runner + 0038 pasted
- Rolling calendar + `fully_managed` critique-gated auto-schedule on cron
- Client: calendar · payments · assets · help · status copy
- Exception email · admin service-level UI
- Parked items: `docs/MANAGED-SERVICE-PENDING.md`
- Fixtures: **273/273** + **20/20**

## Wave 6 — WAITING ON GOOGLE

When GO → OWNER-OPS + M45 → flip `PUBLISHING_LIVE` + `ADS_LIVE` + `ANALYTICS_LIVE` together.

## Still untracked (do not commit)

`scripts/*-isolation*` · `resolve-*.mjs` · `_owner_paste_*` · `temp-route-ours.ts`

## Owner ops

Phases 1-2 done · Phase 3 Google blocked · Phase 4 parked · **0038 pasted**
