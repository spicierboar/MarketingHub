# V1 module progress — orchestrator ledger

**Maintained by agent `M99-Orchestrator` only.** Integrator and builders read this; they do not edit it.

Last updated: 2026-07-09 (**P0 batch kickoff** — M16 pending)

## Tracker (15 modules)

| # | Module | Status | Migration | Notes |
|---|--------|--------|-----------|-------|
| 1 | Scale foundation | **DONE (builder)** | 0013–0015 ✅ | Owner-only: Resend · live keys (parked) |
| 2–15 | All feature modules | **DONE** | **0027** ✅ | Batches 1–8 |

## Batches 1–8 — **COMPLETE** ✅ · fixtures **67/67 · 20/20**

---

## Active batch — **P0** (M16–M19)

**Decision:** Owner chose **B** — P0 builder (client portal + field sales + auto-publish).

**Plan:** `docs/P0-IMPLEMENTATION-PLAN.md` · `docs/parallel/P0-MULTI-AGENT-PLAN.md`

| Agent | Scope | Branch | Status | Migration |
|-------|-------|--------|--------|-----------|
| **M16-Foundation** | Scheduling extract · portal RBAC helpers · signup hide · client-approval stub | `p0/m16-foundation` | **pending** — launch D1 | none |
| **M17-ClientPortal** | `/client` route group · requests · approvals UI | `p0/m17-client-portal` | **blocked** — wait M16 merge | none |
| **M18-AutoPublish** | `client-approval.ts` · auto-publish · token approve wire | `p0/m18-auto-publish` | **blocked** — wait M16 merge | none |
| **M19-FieldSales** | `/sales/new-client` wizard · provision client | `p0/m19-field-sales` | **blocked** — wait M16 merge | none |
| **M00-Integrator** | Merge · self-tests · HANDOVER | merge → `main` | **waiting** — after M16–M19 handoffs | none |

**Launch order (enforced):**

1. **D1:** M16 alone → merge to `main`
2. **D2+:** M17 + M18 + M19 parallel (max 3)
3. **Then:** M00 integrator

**M99 gate:** M16 must be **merged to `main`** before launching M17/M18/M19.

### Migration reservations

| Slot | Status | Owner action |
|------|--------|--------------|
| **0028** `portal_and_sales.sql` | **DEFERRED (P1)** | **No paste during P0** — infer portal user from `member` + single `company_access` |

### File ownership (collision stops)

| File / area | Owner | Rule |
|-------------|-------|------|
| `src/lib/auth/rbac.ts` | M16 → M17/M19 sequential after merge | **Never parallel** |
| `src/app/approve/[token]/actions.ts` | M18 only | M17 must not touch |
| `src/lib/client-approval.ts` | M18 (M16 stub only) | M17 imports API |
| `src/lib/scheduling.ts` | M16 | M18 read-only |
| `src/app/(client)/**` | M17 | — |
| `src/app/(app)/sales/**` | M19 | — |

Full table: `docs/parallel/P0-MULTI-AGENT-PLAN.md`

### P0 fixture target (post-M00)

| Milestone | self-test | queue-test |
|-----------|-----------|------------|
| P0 complete (target) | **77/77** | **20/20** |

Baseline until M00: **67/67** · **20/20**

---

## Owner ops (in progress)

| # | Task | Status |
|---|------|--------|
| 1 | Park Meta + Google together | ✅ locked in HANDOVER + this ledger |
| 2 | Domains mangotickle.com.au / .com | ✅ `.com.au` live · `mangotickle.com` → `.com.au` redirect **parked** |
| 3 | Repair HANDOVER | ✅ done (START HERE = V1 complete) |
| 4 | Migration **0027** paste | ✅ applied + probed |
| 5 | **M-OWNER-OPS** live cutover runbook | ✅ `docs/OWNER-LIVE-CUTOVER.md` |
| 6 | Phase 1 — Vercel + DNS + APP_ORIGIN | ✅ **GO** |
| 7 | Phase 2 — Resend SMTP + magic-link | ✅ **GO** |
| 8 | Phase 3 — Google billing + OAuth | ⏳ **blocked** |
| 9 | Phase 4 — Meta+Google single cutover | ⏳ parked |

**P0 builder does not unblock Phase 3/4.** Live flags stay OFF.

### Domains (canonical cutover — when Meta+Google unparked)

- Primary: `https://mangotickle.com.au` → `APP_ORIGIN`
- Redirect: `mangotickle.com` → `.com.au`
- OAuth: `https://mangotickle.com.au/api/oauth/callback`
- Meta webhook: `https://mangotickle.com.au/api/ads/leads/webhook`
- Supabase Auth: `https://mangotickle.com.au/auth/callback`

---

## Session handoff (paste into new M99 chat)

**Phase:** **P0 batch active** — M16 foundation pending.

**Orchestrator next:**

1. Confirm M16 merged to `main` (check branch `p0/m16-foundation` + handoff `docs/parallel/M16-handoff.md`)
2. When M16 merged → launch **M17 + M18 + M19** in parallel (3 chats)
3. When all handoffs ready → launch **M00-P0-Integrator**
4. When M00 green → mark P0 complete · issue owner pilot checklist

**Owner during P0:** No migration paste (0028 deferred). No `PUBLISHING_LIVE`/`ADS_LIVE` flip.

**Handoffs:** V1 archived under `docs/parallel/archive/` · P0 handoffs live in `docs/parallel/M{16-19}-handoff.md`

---

## P0 complete checklist (M00 fills after green)

- [ ] Portal client: request → approve in `/client`
- [ ] Token `/approve/[token]` + auto-publish
- [ ] Field sales: company + add-on + client login in one flow
- [ ] Signup invite-only
- [ ] Fixtures **77/77** · **20/20** · build green
- [ ] HANDOVER START HERE updated
- [ ] Owner pilot smoke on `https://mangotickle.com.au`

### Owner pilot checklist (issue when P0 complete)

1. Log in as agency admin → `/sales/new-client` → create test company + member
2. Magic-link client user → lands on `/client` (not agency nav)
3. Client submits request → agency drafts content (back-office) → client approves in portal
4. Verify auto-publish sim path (audit log / publish queue entry; `PUBLISHING_LIVE=false` OK)
5. Token approve link still works for email-based approvals
6. Confirm signup page shows invite-only message
