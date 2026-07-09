# Orchestrator ledger

Last updated: 2026-07-09 (**W2 integrator in flight**)

**Owner lock:** Full SRS · vision · go-live = non-negotiable.  
**Schedule:** `docs/parallel/FULL-ORCHESTRATION.md` → **Schedule — per-agent estimates**

## Standing instructions (integrators + M99)

**Auto-spawn next wave — no owner wait (except W6).** See `FULL-ORCHESTRATION.md`.  
**Token discipline:** one chat per agent · handoffs mandatory · fresh M99 per wave · `HANDOFF-TEMPLATE.md`

---

## Schedule at a glance

| Wave | Status | Wall-clock est. | ETA (planning) |
|------|--------|-----------------|----------------|
| W0 P0 | ✅ DONE | ~4–6d (observed ~1–2d) | — |
| W1 | ✅ DONE | ~2–3d (observed ~1d) | — |
| **W2** | **integrating** | **~4–6d** | **~Jul 13–15** |
| W3 | queued | ~4–6d | ~Jul 17–21 |
| W4 | queued | ~4–6d | ~Jul 21–27 |
| W5 | queued | ~4–6d | ~Jul 25 – Aug 2 |
| W6 | owner gate | days + **weeks?** | blocked (Google) |
| W7 | queued | ~6–8d post-W6 | after go-live |
| **`full_complete`** | — | **~22–32d code** + W6 | **~early Aug** (code) |

---

## V1 — DONE (67/67 · 20/20 baseline)

## Wave 0 (P0) — DONE ✅ · `p0_complete=yes` · 77/77

## Wave 1 — DONE ✅ · `w1_complete=yes` · 90/90 · **0028 applied** ✅

## Wave 2 — INTEGRATING

| Agent | Branch | Status |
|-------|--------|--------|
| M24 | `w2/m24-live-publish` | ✅ merged |
| M25 | `w2/m25-live-ads` | ✅ merged |
| M26 | `w2/m26-live-analytics` | ✅ merging |
| M27 | `w2/m27-public-api` | pending |
| M01-W2 | → main | **running** |

| Flag | Status |
|------|--------|
| `w2_launched` | yes |
| `m24_handoff` | yes |
| `m25_handoff` | yes |
| `m26_handoff` | yes |
| `m27_handoff` | yes |
| `w2_integrator_launched` | yes |
| `w2_complete` | no |

**Target:** ~98/98 fixtures (90 baseline + 3 M24 + 5 M26) · live flags **OFF**

## Waves 3–7 — QUEUED

`w3_launched=no` · `full_complete=no` · W6 Phase 3 **blocked**

## Owner ops

Phases 1–2 ✅ · Phase 3 Google blocked · Phase 4 parked · `https://mangotickle.com.au`

---

## Owner pilot (optional anytime)

P0 checklist (6 steps) + W1 smoke (`/client/reports`, intel panel, calendar assist) in prior sessions.
