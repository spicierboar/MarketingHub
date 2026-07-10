# Orchestrator ledger

Last updated: 2026-07-10 (**W4 SHIPPED**)

**Owner lock:** Full SRS · vision · go-live = non-negotiable.  
**Schedule:** `docs/parallel/FULL-ORCHESTRATION.md`

## Standing instructions (integrators + M99)

**Auto-spawn next wave — no owner wait (except W6).** See `FULL-ORCHESTRATION.md`.  
**Token discipline:** one chat per agent · handoffs mandatory · fresh M99 per wave · `HANDOFF-TEMPLATE.md`

---

## Schedule at a glance

| Wave | Status | Wall-clock est. | ETA (planning) |
|------|--------|-----------------|----------------|
| W0 P0 | DONE | ~4-6d | - |
| W1 | DONE | ~2-3d | - |
| W2 | DONE | ~4-6d | - |
| W3 | DONE | ~4-6d | - |
| **W4** | **DONE** | **~4-6d** | **~Jul 21-27** |
| W5 | queued | ~4-6d | ~Jul 25 - Aug 2 |
| W6 | owner gate | days + weeks? | blocked (Google) |
| W7 | queued | ~6-8d post-W6 | after go-live |
| **`full_complete`** | - | **~22-32d code** + W6 | **~early Aug** (code) |

---

## Wave 3 — DONE · `w3_complete=yes` · 110/110

## Wave 4 — DONE

| Agent | Branch | Status |
|-------|--------|--------|
| M34 | `w4/m34-cms` | merged |
| M35 | `w4/m35-funnel` | merged |
| M36 | `w4/m36-automation` | merged |
| M37 | `w4/m37-loyalty` | merged |
| M01-W4 | main | integrated |

| Flag | Status |
|------|--------|
| `w4_launched` | yes |
| `m34_handoff` | yes |
| `m35_handoff` | yes |
| `m36_handoff` | yes |
| `m37_handoff` | yes |
| `w4_complete` | **yes** |

**Fixtures:** self-test **131/131** · queue-test **20/20** · live flags **OFF**

**Routes:** `/cms` · `/funnel` · `/workflows` · `/loyalty`

**Migrations (owner paste when ready):** `0032_cms.sql` · `0032_funnel.sql` · `0032_marketing_automation.sql` · `0032_loyalty.sql`

## Wave 5 — QUEUED (next)

| Agent | Scope |
|-------|-------|
| M40 | Full RAG |
| M41 | AI recommendations |
| M42 | AI-MOS auto |
| M43 | Campaign builder |

`w5_launched=no` · `w5_complete=no`

## Waves 6-7 — QUEUED

`full_complete=no` · W6 Phase 3 **blocked**

## Owner ops

Phases 1-2 done · Phase 3 Google blocked · Phase 4 parked · `https://mangotickle.com.au`
