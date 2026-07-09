# Orchestrator ledger

Last updated: 2026-07-09 (**M00 integrating P0**)

**Owner lock:** Full SRS · vision · go-live = non-negotiable. See `docs/FULL-IMPLEMENTATION-PLAN.md` · `docs/parallel/FULL-ORCHESTRATION.md`.

## V1 — DONE (67/67 · 20/20 baseline)

## Wave 0 (P0) — INTEGRATING

| Agent | Branch | Status |
|-------|--------|--------|
| M16 | `p0/m16-foundation` | ✅ merged |
| M17 | `p0/m17-client-portal` | ✅ handoff on branch |
| M18 | `p0/m18-auto-publish` | ✅ merging |
| M19 | `p0/m19-field-sales` | ✅ handoff on branch |
| M00 | → main | **integrating** |

| Flag | Status |
|------|--------|
| `m16_merged` | yes |
| `parallel_launched` | yes |
| `m17_handoff` | yes |
| `m18_handoff` | yes |
| `m19_handoff` | yes |
| `m00_launched` | yes |
| `p0_complete` | no |

**W0 fixture target:** 77/77 · 20/20

## Waves 1–7 — QUEUED (auto-chain after W0)

| Wave | Agents | Status |
|------|--------|--------|
| W1 | M20–M23 → M01-W1 | queued |
| W2 | M24–M27 | queued |
| W3 | M30–M33 (CRM·email·SMS·reviews) | queued |
| W4 | M34–M37 | queued |
| W5 | M40–M43 | queued |
| W6 | M-OWNER-OPS + M45 go-live | queued (Phase 3 blocked) |
| W7 | M50–M55 → M01-FINAL | queued |

| Flag | Status |
|------|--------|
| `w1_launched` | no |
| `full_complete` | no |

**M00 spawns W1** when `p0_complete=yes`. **Live flags flip W6 only.**

## Owner ops

Phases 1–2 ✅ · Phase 3 Google blocked · Phase 4 parked

**Canonical:** `https://mangotickle.com.au`

---

## Checklists

### W0 (M00)

- [ ] Portal · sales · auto-publish · invite-only
- [ ] 77/77 · 20/20 · build green
- [ ] Spawn W1

### Owner pilot (after `p0_complete=yes`)

1. Agency admin → `/sales/new-client` → test company + client member
2. Client magic link → lands on `/client`
3. Client request → agency drafts → client approves in portal
4. Auto-publish sim path (audit / queue; live flags stay OFF)
5. Token `/approve/[token]` still works
6. `/signup` shows invite-only
