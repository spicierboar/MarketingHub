# Orchestrator ledger

Last updated: 2026-07-09 (**W2 SHIPPED**)

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
| **W2** | **DONE** | **~4-6d** | **~Jul 13-15** |
| **W3** | **in flight** | **~4-6d** | **~Jul 17-21** |
| W4 | queued | ~4-6d | ~Jul 21-27 |
| W5 | queued | ~4-6d | ~Jul 25 - Aug 2 |
| W6 | owner gate | days + weeks? | blocked (Google) |
| W7 | queued | ~6-8d post-W6 | after go-live |
| **`full_complete`** | - | **~22-32d code** + W6 | **~early Aug** (code) |

---

## V1 — DONE (67/67 baseline)

## Wave 0 (P0) — DONE · `p0_complete=yes` · 77/77

## Wave 1 — DONE · `w1_complete=yes` · 90/90 · **0028 applied**

## Wave 2 — DONE

| Agent | Branch | Status |
|-------|--------|--------|
| M24 | `w2/m24-live-publish` | merged |
| M25 | `w2/m25-live-ads` | merged |
| M26 | `w2/m26-live-analytics` | merged |
| M27 | `w2/m27-public-api` | merged |
| M01-W2 | main | integrated |

| Flag | Status |
|------|--------|
| `w2_launched` | yes |
| `m24_handoff` | yes |
| `m25_handoff` | yes |
| `m26_handoff` | yes |
| `m27_handoff` | yes |
| `w2_complete` | **yes** |

**Fixtures:** self-test **103/103** · queue-test **20/20** · live flags **OFF**

**Migrations (owner paste when ready):** `0029_public_api.sql` · `0030_ad_campaign_external_id.sql`

## Wave 3 — IN FLIGHT

| Agent | Branch | Status |
|-------|--------|--------|
| M30 | `w3/m30-crm` | spawned |
| M31 | `w3/m31-email` | spawned |
| M32 | `w3/m32-sms` | spawned |
| M33 | `w3/m33-reviews` | spawned |
| M01-W3 | main | waiting |

| Flag | Status |
|------|--------|
| `w3_launched` | **yes** |
| `m30_handoff` | no |
| `m31_handoff` | no |
| `m32_handoff` | no |
| `m33_handoff` | no |
| `w3_complete` | no |

**Target:** ~110/110 fixtures · live flags **OFF**

## Waves 4-7 — QUEUED

`full_complete=no` · W6 Phase 3 **blocked**

## Owner ops

Phases 1-2 done · Phase 3 Google blocked · Phase 4 parked · `https://mangotickle.com.au`