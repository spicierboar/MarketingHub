# V1 module progress — orchestrator ledger

**Maintained by agent `M99-Orchestrator` only.** Integrator and builders read this; they do not edit it.

Last updated: 2026-07-09 (**M-OWNER-OPS** · `docs/OWNER-LIVE-CUTOVER.md` complete)

## Tracker (15 modules)

| # | Module | Status | Migration | Notes |
|---|--------|--------|-----------|-------|
| 1 | Scale foundation | **DONE (builder)** | 0013–0015 ✅ | Owner-only: Resend · live keys (parked) |
| 2–15 | All feature modules | **DONE** | **0027** ✅ | Batches 1–8 |

## Batches 1–8 — **COMPLETE** ✅ · fixtures **67/67 · 20/20**

## Active batch

**None** (V1 builders). **Owner-ops runbook ready** — execute `docs/OWNER-LIVE-CUTOVER.md` (interactive: `docs/parallel/M-OWNER-OPS-prompt.md`).

## Owner ops (in progress)

| # | Task | Status |
|---|------|--------|
| 1 | Park Meta + Google together | ✅ locked in HANDOVER + this ledger |
| 2 | Domains mangotickle.com.au / .com | ✅ recorded · **Phase 1 deploy** (M-OWNER-OPS) |
| 3 | Repair HANDOVER | ✅ done (START HERE = V1 complete) |
| 4 | Migration **0027** paste | ✅ applied + probed (tables exist, count 0) |
| 5 | **M-OWNER-OPS** live cutover runbook | ✅ `docs/OWNER-LIVE-CUTOVER.md` |
| 6 | Phase 1 — Vercel + DNS + APP_ORIGIN | ⏳ owner executes after runbook |
| 7 | Phase 2 — Resend SMTP + magic-link | ⏳ after Phase 1 |
| 8 | Phase 3 — Google billing + OAuth | ⏳ parallel prep · billing blocked |
| 9 | Phase 4 — Meta+Google single cutover | ⏳ parked until 6+7+8 ready |

### Domains (canonical cutover — when Meta+Google unparked)

- Primary: `https://mangotickle.com.au` → `APP_ORIGIN`
- Redirect: `mangotickle.com` → `.com.au`
- OAuth: `https://mangotickle.com.au/api/oauth/callback`
- Meta webhook: `https://mangotickle.com.au/api/ads/leads/webhook`
- Supabase Auth: `https://mangotickle.com.au/auth/callback`

### Meta + Google (parked)

Do not file Meta App Review or flip live flags until Google billing + OAuth are also ready. Complete both tracks in one cutover.

## Fixture baseline

| Milestone | self-test | queue-test |
|-----------|-----------|------------|
| V1 builders complete | **67/67** | **20/20** |

---

## Session handoff (paste into new M99 chat)

**Phase:** V1 builders **COMPLETE** — orchestrator role = owner-ops coordinator + V2 planning only (no new builders unless owner explicitly starts V2).

**Owner next (priority):** execute Phase 1 in `docs/OWNER-LIVE-CUTOVER.md` (Vercel + DNS + `APP_ORIGIN`) · then Resend SMTP · then Google billing · then Meta+Google cutover together · V2 deferred.

**Demo note:** `.env.local` may have been renamed to `.env.local.bak` for in-memory demo on port 3002 — restore for Supabase mode.

**Handoffs:** all archived under `docs/parallel/archive/` (M01b through M14).

