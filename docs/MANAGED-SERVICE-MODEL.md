# Managed Service Model

Product decisions for Marketing Command Centre as an **outsourced managed marketing service**, not a self-serve social publishing tool.

## Product identity

- Clients buy a managed marketing service (strategy, calendar, content, campaigns) operated by the agency/platform.
- The client portal is a **review and control surface**, not a DIY content studio.
- Hard locks remain: critique gate, isolation, `appEnv()` (never `NODE_ENV`), OAuth-only publishing, AI never auto-publishes / auto-spends / activates promotions without a human path.

## Service levels

| Level | Meaning |
|-------|---------|
| `approval` | Default. Every material action waits for client (or admin) approval. |
| `managed_exceptions` | Low-risk operational drafts/suggestions may proceed within policy; material publish/spend still gated. |
| `fully_managed` | Pre-authorised **low-risk** work within limits + critique + audit. **Not** unsupervised AI publish. May call `scheduleOne` on **already-approved** content under pre-granted authority (`schedule_approved`) — critique still runs inside `scheduleOne`. |

`fully_managed` still requires:

- Critique / `scheduleOne` (or equivalent) before anything goes live
- Existing approval policies and spend gates
- Full audit via `logAction`

## What AI / delivery runners may do

Allowed without a separate client click (subject to service level + authority helpers):

- Create **draft** campaigns and **ai_draft** content
- Create calendar **suggestions** (assist rows / planned dates)
- Advance managed delivery phases and status copy
- At `fully_managed` only: call `scheduleOne` on assist-ready **approved** content (`schedule_approved`) — critique gate inside `scheduleOne` is never bypassed

Never without the human path:

- Publish / go-live without critique (always via `scheduleOne` / publish queue)
- Auto-spend ad budget or activate promotions
- Bypass critique

## Payments (track)

- **C1 (now):** delegated ad spend + SaaS Stripe billing
- **C2 (shipped):** prepaid company credit wallet with **$50 minimum floor**, ledger, Stripe Checkout top-up when configured (webhook credits + tax invoice), simulated path in demo; auto top-up still ledger-only until off-session PM; gates activate/spend paths via `assertPrepaidCredit`
- **Tax invoices (shipped):** local AU GST tax-invoice SoT (`tax_invoices`), client + agency list/print, credit notes / void; management-fee runs also issue local invoices

Parked showstoppers and deferred product work: [`MANAGED-SERVICE-PENDING.md`](./MANAGED-SERVICE-PENDING.md).

## Delivery SLA

- After onboarding completes: **24h strategy + calendar** SLA (`strategyDueAt` = onboarding + 24h)
- Rolling **30-day** calendar maintained via background jobs (`processDueManagedDeliveries` on the scheduler tick)
- Managed auto-progress (`progressManagedSchedulesForTenant`) schedules assist-ready approved content for `fully_managed` companies after the rolling calendar top-up

## Client portal surfaces (only)

1. Home (status)  
2. Approvals  
3. Calendar  
4. Results  
5. Files  
6. Billing  
7. Ask us  
8. Help  

Nav is review-first. No self-serve publish console in the client portal.

## Hard locks (preserved)

- Critique gate untouched  
- Never import store from feature code — use `@/lib/db`  
- All repo / audit / scope calls `await`ed  
- `logAction` on material actions  
- `appEnv()` never `NODE_ENV`  
- Isolation between tenants  
