# P0 Implementation Plan — AI Marketing OS gaps

**Product:** Marketing Command Centre (modify existing codebase)  
**Model:** One agency tenant (TGLT) → many **companies** (clients) → scoped **client users**  
**Decision:** **B** — build P0 on existing repo (not greenfield)  
**Last updated:** 2026-07-09

## Scope (P0)

| # | Deliverable | SRS alignment |
|---|-------------|---------------|
| 1 | Client portal `/client` | §11, §22, §75 |
| 2 | Field sales wizard `/sales/new-client` | §9, §75 |
| 3 | Auto-publish on client approve | §21 |
| 4 | Invite-only UX (signup hide) | §7 parked |

**Out of P0 (Wave 0 only):** See `docs/FULL-IMPLEMENTATION-PLAN.md` — deferred items ship in Waves 1–7 (non-negotiable).

## Architecture

- **Modular monolith** (Next.js + Supabase) — no microservices for P0
- **API:** Server actions + existing webhooks (not REST catalog)
- **DB migrations:** **0 required** — optional `0028_portal_and_sales.sql` deferred

## Data model (SRS → existing)

| SRS | Schema |
|-----|--------|
| Agency | `tenants` |
| Client | `companies` |
| User | `app_users` + `tenant_members` + `company_access` |
| Subscription | `tenants.plan` + `company_entitlements` (add-ons) |
| Content / Campaign / Asset / AI runs / Audit | `content_items`, `campaigns`, `assets`, `ai_runs`, `audit_logs` |

Portal users: `member` + exactly one `company_access` row (infer in code; no migration for P0).

## UI routes (new)

| Group | Paths |
|-------|-------|
| Client portal | `/client`, `/client/requests/*`, `/client/approvals/*` |
| Field sales | `/sales/new-client` |
| Public polish | `/login`, `/signup` invite-only |

## Work modules (11)

1. Scheduling extract (`lib/scheduling.ts`)
2. Portal RBAC & auth redirect
3. Invite-only UX
4. Client shell & layout
5. Client requests UI
6. Client approvals UI
7. Portal server actions
8. Auto-publish engine
9. Field sales wizard
10. Self-test / fixtures
11. Docs / ledger

**~32 file touchpoints** (~14 new, ~18 modified).

## Phases

| Phase | Duration | Content |
|-------|----------|---------|
| 0 Foundation | 1 day | M16 — scheduling, RBAC helpers, signup hide |
| 1 Parallel | 3 days | M17 portal + M18 auto-publish + M19 field sales |
| 2 Integrate | 2 days | M00 merge, self-tests, build, deploy |

## Success criteria

- Portal client can request + approve in `/client`
- Sales rep creates company + add-ons + client login in one flow
- Client approve → schedule → publish queue (sim OK)
- Fixtures green; live flags stay OFF
- Owner can run first pilot

## P1 (after pilot)

- Client reports `/client/reports`
- Intelligence profile panel on company page
- AI 30-day calendar assist
- Optional migration `0028` (`portal_only` flag)

## Related docs

- Multi-agent execution: `docs/parallel/P0-MULTI-AGENT-PLAN.md`
- **Auto-orchestration (hands-off):** `docs/parallel/P0-ORCHESTRATION.md`
- **Owner step-away:** `docs/parallel/P0-OWNER-STEPOUT.md`
- Owner cutover: `docs/OWNER-LIVE-CUTOVER.md`
- Live ledger: `docs/parallel/PROGRESS.md`
