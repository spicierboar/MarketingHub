# Orchestrator ledger

Last updated: 2026-07-09 (**W1 COMPLETE**)

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
| `w2_launched` | no |
| `full_complete` | no |

**Fixtures:** self-test **90/90** · queue-test **20/20** · migration **0028** on main (owner paste when ready)

**Live flags:** OFF until W6.

## Waves 2–7 — QUEUED

W2 M24–M27 · W3 CRM/email/SMS/reviews · W4–W7 per FULL-IMPLEMENTATION-PLAN.md

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
