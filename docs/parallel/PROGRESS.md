# Orchestrator ledger

Last updated: 2026-07-09 (**W2 in flight**)

**Owner lock:** Full SRS · vision · go-live = non-negotiable. See `docs/FULL-IMPLEMENTATION-PLAN.md` · `docs/parallel/FULL-ORCHESTRATION.md`.

## V1 — DONE (67/67 · 20/20 baseline)

## Wave 0 (P0) — DONE ✅

| Agent | Branch | Status |
|-------|--------|--------|
| M16–M19 + M00 | merged | ✅ |

| Flag | Status |
|------|--------|
| `p0_complete` | yes |

**Fixtures:** self-test **77/77** · queue-test **20/20**

## Wave 1 — DONE ✅

| Agent | Branch | Status |
|-------|--------|--------|
| M20 | `w1/m20-client-reports` | ✅ merged |
| M21 | `w1/m21-intel-panel` | ✅ merged |
| M22 | `w1/m22-calendar-assist` | ✅ merged |
| M23 | `w1/m23-portal-migration` | ✅ merged |
| M01-W1 | → main | ✅ integrated |

| Flag | Status |
|------|--------|
| `w1_launched` | yes |
| `m20_handoff` | yes |
| `m21_handoff` | yes |
| `m22_handoff` | yes |
| `m23_handoff` | yes |
| `w1_complete` | yes |
| `w2_launched` | yes |
| `full_complete` | no |

**Fixtures:** self-test **90/90** · queue-test **20/20** · migration **0028** on main (owner paste when ready)

**Live flags:** OFF until W6.

## Wave 2 — IN FLIGHT

| Agent | Branch | Status |
|-------|--------|--------|
| M24 | `w2/m24-live-publish` | ✅ handoff |
| M25 | `w2/m25-live-ads` | building |
| M26 | `w2/m26-live-analytics` | building |
| M27 | `w2/m27-public-api` | building |
| M01-W2 | → main | waiting |

| Flag | Status |
|------|--------|
| `m24_handoff` | yes |
| `m25_handoff` | no |
| `m26_handoff` | no |
| `m27_handoff` | no |
| `w2_complete` | no |

**Fixtures:** self-test **93+** (90 baseline + M24) · live flags **OFF**

## Waves 3–7 — QUEUED

W3 CRM/email/SMS/reviews · W4–W7 per FULL-IMPLEMENTATION-PLAN.md

## Owner ops

Phases 1–2 ✅ · Phase 3 Google blocked · Phase 4 parked

**Canonical:** `https://mangotickle.com.au`

---

## Owner pilot (P0 — run anytime)

1. `/sales/new-client` → test company + client member
2. Client magic link → `/client`
3. Request → draft → portal approve
4. Auto-publish sim path
5. Token `/approve/[token]`
6. `/signup` invite-only
