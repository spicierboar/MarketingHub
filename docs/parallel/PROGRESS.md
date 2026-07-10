# Orchestrator ledger

Last updated: 2026-07-10 (**W5 SHIPPED**)

**Owner lock:** Full SRS → vision → go-live = non-negotiable.  
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
| W4 | DONE | ~4-6d | - |
| **W5** | **DONE** | **~4-6d** | **~Jul 10** |
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

## Wave 5 — DONE

| Agent | Branch | Status |
|-------|--------|--------|
| M40 | `w5/m40-rag` | merged |
| M41 | `w5/m41-recommendations` | merged |
| M42 | `w5/m42-ai-mos` | merged |
| M43 | `w5/m43-campaign-builder` | merged |
| M01-W5 | main | integrated |

| Flag | Status |
|------|--------|
| `w5_launched` | yes |
| `m40_handoff` | yes |
| `m41_handoff` | yes |
| `m42_handoff` | yes |
| `m43_handoff` | yes |
| `w5_complete` | **yes** |

**Fixtures:** self-test **165/165** · queue-test **20/20** · live flags **OFF**

**Migrations (owner paste when ready):** `0033_rag.sql` · `0033_recommendations.sql` · `0033_campaign_builder.sql`

## Waves 6-7 — QUEUED

`full_complete=no` · W6 Phase 3 **blocked**

## Owner ops

Phases 1-2 done · Phase 3 Google blocked · Phase 4 parked · `https://mangotickle.com.au`

---
