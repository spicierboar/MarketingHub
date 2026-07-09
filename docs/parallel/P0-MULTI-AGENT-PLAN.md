# P0 multi-agent parallel plan — AI Marketing OS gaps

**Goal:** Close P0 in **~5–7 calendar days** with **4 builders + 1 integrator + 1 orchestrator**.

**Model:** Modify existing monolith · TGLT = one tenant → many companies · no microservices · no live flag flips.

**Related:** `docs/P0-IMPLEMENTATION-PLAN.md` · live ledger `docs/parallel/PROGRESS.md`

---

## Module inventory

| Category | Count | Detail |
|----------|------:|--------|
| Work modules (logical code areas) | **11** | See table below |
| Coding agents | **4** | M16–M19 (parallel after foundation) |
| Support agents | **2** | M99 orchestrator, M00 integrator |
| New files | **~14** | Routes, libs, components, tests |
| Modified files | **~18** | Existing routes, RBAC, calendar, auth |
| Total file touchpoints | **~32** | |
| DB migrations required (P0) | **0** | Slot **0028** = **DEFERRED** (no owner paste) |
| New self-test checks | **~10** | Portal isolation + auto-publish (M00) |

### The 11 work modules

| # | Module | Agent | New | Mod |
|---|--------|-------|-----|-----|
| M1 | Scheduling extract | M16 | 1 | 1 |
| M2 | Portal RBAC & auth routing | M16 | 1 | 3 |
| M3 | Invite-only UX | M16 | 0 | 2 |
| M4 | Client shell & layout | M17 | 3 | 1 |
| M5 | Client requests UI | M17 | 4 | 1 |
| M6 | Client approvals UI | M17 | 3 | 0 |
| M7 | Portal server actions | M17 | 1 | 2 |
| M8 | Auto-publish engine | M18 | 2 | 3 |
| M9 | Field sales wizard | M19 | 2 | 4 |
| M10 | Self-test / fixtures | M00 | 1 | 2 |
| M11 | Docs / ledger | M00 | 1 | 1 |

---

## Launch order (enforced by M99)

| Day | Activity |
|-----|----------|
| **D0** | M99 assigns agents, reserves file ownership, publishes interface contract |
| **D1** | **M16 only** → merge foundation to `main` (**blocks** M17/M18/M19) |
| **D2–D4** | **M17 + M18 + M19 in parallel** (max 3) |
| **D5–D6** | **M00** merge, conflict resolve, self-tests, build |
| **D7** | Owner pilot smoke on production |

**M99 gate:** Do **not** launch M17/M18/M19 until M16 is **merged to `main`**.

---

## File ownership (no collisions)

| File / area | Owner | Others |
|-------------|-------|--------|
| `src/lib/scheduling.ts` | **M16** | M18 read-only |
| `src/lib/auth/rbac.ts` | **M16** (helpers) → **M17** (`requirePortalUser`) after M16 merges → **M19** (`requireSalesRep`) after M16 merges | **Never parallel** on this file |
| `src/lib/client-approval.ts` | **M18** (full impl) | M16 stub types only; M17 imports API |
| `src/lib/auto-publish-on-approve.ts` | **M18** | — |
| `src/app/(client)/**` | **M17** | — |
| `src/app/(app)/sales/**` | **M19** | — |
| `src/app/approve/[token]/actions.ts` | **M18** | M17 must **not** touch |
| `src/app/login/*`, `signup/*`, auth redirect | **M16** | — |
| `src/app/(app)/calendar/actions.ts` | **M16** | — |
| `src/components/app-shell.tsx` | **M19** | M17 does not touch |
| `src/lib/selftest/portal.ts` | **M00** | — |
| `src/lib/types.ts` | **Avoid** — use jsonb `profile` slices | |

### Shared interface contract (M16 handoff → M17/M18)

```typescript
// src/lib/client-approval.ts — M18 owns, M17 imports

export async function completeClientApproval(args: {
  contentId: string;
  actor: ClientApprovalActor; // token or portal user
  decision: "approved" | "changes_requested";
  note?: string;
}): Promise<{ ok: true; autoPublish?: "scheduled" | "published" | "skipped" | "blocked" }>;

// M18 implements: governContent → update status → autoPublishOnApprove()
// M17 portal UI only calls completeClientApproval()
```

---

## Agent roster

| Agent | Chat title | Branch | Depends | Est. |
|-------|------------|--------|---------|------|
| **M99-Orchestrator** | `M99-P0-Orchestrator` | — | — | D0 |
| **M16-Foundation** | `M16-P0-Foundation` | `p0/m16-foundation` | — | 1d |
| **M17-ClientPortal** | `M17-P0-ClientPortal` | `p0/m17-client-portal` | M16 merged | 3d |
| **M18-AutoPublish** | `M18-P0-AutoPublish` | `p0/m18-auto-publish` | M16 merged | 2d |
| **M19-FieldSales** | `M19-P0-FieldSales` | `p0/m19-field-sales` | M16 merged | 3d |
| **M00-Integrator** | `M00-P0-Integrator` | merge → `main` | M17–M19 handoffs | 2d |

---

## Builder prompts

### M16-Foundation (run first — blocks parallel)

```
AGENT: M16-P0-Foundation
Path: F:/MarketingHub/command-centre
Branch: p0/m16-foundation · merge before M17/M18/M19

READ: HANDOVER.md START HERE · docs/P0-IMPLEMENTATION-PLAN.md · docs/parallel/P0-MULTI-AGENT-PLAN.md (file ownership)

SCOPE (modules M1–M3):
1. Extract scheduleOne → src/lib/scheduling.ts; calendar/actions.ts delegates
2. rbac.ts: isPortalUser(), portalCompanyId(), portalCompanyIds()
3. Central post-login redirect (portal → /client, owner → /onboarding, else /dashboard)
4. E4 signup hide: login/page.tsx + signup/page.tsx invite-only
5. Stub src/lib/client-approval.ts exporting types only (M18 fills impl)

NON-NEGOTIABLES:
- THE ISOLATION RULE · appEnv() not NODE_ENV
- No migration · no types.ts unless unavoidable
- tsc + build + fixtures 67/67 · 20/20 before handoff

OUTPUT: docs/parallel/M16-handoff.md with interface contract for M17/M18
DO NOT: build (client) routes · sales wizard · auto-publish logic · approve/[token]/actions.ts
```

### M17-ClientPortal (parallel track A — WAIT for M16 merge)

```
AGENT: M17-P0-ClientPortal
Path: F:/MarketingHub/command-centre
Branch: p0/m17-client-portal
WAIT: M16 merged to main

SCOPE (modules M4–M7):
NEW route group src/app/(client)/:
  layout.tsx — requirePortalUser(), client-shell (tenant branding)
  /client — dashboard: pending approvals, open requests, status chips
  /client/requests — list (visibleRequests scoped)
  /client/requests/new — simplified create (auto companyId, no AI draft button)
  /client/requests/[id] — timeline, answerGap only
  /client/approvals — pending client_review
  /client/approvals/[contentId] — preview + approve/changes

rbac: requirePortalUser() — member + exactly 1 company_access
Block (app)/* for portal users → redirect /client

Actions: src/app/(client)/actions.ts
  - call completeClientApproval() from lib/client-approval.ts (M18 impl; stub ok until merge)
  - reuse createRequestAction patterns via assertCompanyAccess

DO NOT TOUCH: approve/[token]/actions.ts · sales/** · scheduling.ts · calendar/actions.ts · rbac.ts (M16 owns until merged)
HANDOFF: docs/parallel/M17-handoff.md
```

### M18-AutoPublish (parallel track B — WAIT for M16 merge)

```
AGENT: M18-P0-AutoPublish
Path: F:/MarketingHub/command-centre
Branch: p0/m18-auto-publish
WAIT: M16 merged (needs lib/scheduling.ts)

SCOPE (module M8):
1. src/lib/auto-publish-on-approve.ts
2. src/lib/client-approval.ts — full implementation + completeClientApproval()
3. Wire approve/[token]/actions.ts → completeClientApproval()

DO NOT TOUCH: (client)/** UI · sales/** · app-shell.tsx · rbac.ts
HANDOFF: docs/parallel/M18-handoff.md with API doc for M17
```

### M19-FieldSales (parallel track C — WAIT for M16 merge)

```
AGENT: M19-P0-FieldSales
Path: F:/MarketingHub/command-centre
Branch: p0/m19-field-sales
WAIT: M16 merged (auth patterns)

SCOPE (module M9):
NEW src/app/(app)/sales/new-client/page.tsx — tablet stepper
NEW src/app/(app)/sales/actions.ts
Steps: business → add-ons → Stripe checkout → provision client → done

DO NOT TOUCH: (client)/** · client-approval · approve actions · rbac.ts (add requireSalesRep only after M16 merged)
HANDOFF: docs/parallel/M19-handoff.md
```

### M00-Integrator (after all builders hand off)

```
AGENT: M00-P0-Integrator
Path: F:/MarketingHub/command-centre

READ: M16–M19 handoffs · docs/parallel/P0-MULTI-AGENT-PLAN.md

MERGE ORDER: m16 → m18 → m17 → m19 (client-approval before portal E2E)
Resolve: rbac.ts, any redirect conflicts

ADD: src/lib/selftest/portal.ts (~4 checks) · wire fixtures
VERIFY: tsc · build · fixtures (target 77/77 self · 20/20 queue)
UPDATE: HANDOVER START HERE (P0 shipped) · archive handoffs

OWNER: no migration paste (0028 DEFERRED) · no PUBLISHING_LIVE/ADS_LIVE flip
```

---

## Migration slot 0028

| Slot | Status | Notes |
|------|--------|-------|
| `0028_portal_and_sales.sql` | **DEFERRED** | Optional `portal_only` flag — **P1 only**. **No owner paste during P0.** |

Previously reserved for M15 security slice (compute-only — no migration shipped).

---

## Definition of done (P0 closed)

- [ ] Portal client: request → see status → approve in `/client`
- [ ] Token `/approve/[token]` still works + auto-publish
- [ ] Sales rep: company + add-on + client magic link in one flow
- [ ] Signup hidden / invite-only
- [ ] Fixtures green · build green
- [ ] `PUBLISHING_LIVE` / `ADS_LIVE` unchanged
- [ ] PROGRESS.md updated · owner pilot checklist issued
