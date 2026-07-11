# Orchestrator ledger

Last updated: 2026-07-11 (**MANAGED-SERVICE FOUNDATION** · **W6 WAITING ON GOOGLE**)

**Owner lock:** Full SRS → vision · go-live = non-negotiable.  
**Schedule:** `docs/parallel/FULL-ORCHESTRATION.md`  
**Model:** `docs/MANAGED-SERVICE-MODEL.md`

---

## Schedule at a glance

| Wave | Status | Notes |
|------|--------|-------|
| W0–W5 | DONE | - |
| **W7** | **DONE** | `w7_complete=yes` |
| **Managed service** | **FOUNDATION** | runner + portal calendar/payments + 24h enqueue |
| **W6** | **WAITING** | Google Cloud billing — park live cutover |
| **`full_complete`** | no | after W6 go-live |

---

## Managed service foundation

- Service levels: `approval` | `managed_exceptions` | `fully_managed` (pre-auth low-risk + critique; never unsupervised publish)
- Payments: **C1** (delegated ads + SaaS Stripe); C2 prepaid credit deferred
- Delivery runner on cron + onboarding/sales enqueue → draft campaign + calendar suggestions only
- Client: `/client/calendar`, `/client/payments`, status copy
- Migration **0038_managed_delivery** — owner paste pending
- Fixtures: **268/268** + **20/20**

## Wave 6 — WAITING ON GOOGLE

When GO → OWNER-OPS + M45 → flip `PUBLISHING_LIVE` + `ADS_LIVE` + `ANALYTICS_LIVE` together.

## Still untracked (do not commit)

`scripts/*-isolation*` · `resolve-*.mjs` · `_owner_paste_*` · `temp-route-ours.ts`

## Owner ops

Phases 1-2 done · Phase 3 Google blocked · Phase 4 parked · paste **0038**
