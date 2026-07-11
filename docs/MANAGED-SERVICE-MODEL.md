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
| `fully_managed` | Pre-authorised **low-risk** work within limits + critique + audit. **Not** unsupervised AI publish. |

`fully_managed` still requires:

- Critique / `scheduleOne` (or equivalent) before anything goes live
- Existing approval policies and spend gates
- Full audit via `logAction`

## What AI / delivery runners may do

Allowed without a separate client click (subject to service level + authority helpers):

- Create **draft** campaigns and **ai_draft** content
- Create calendar **suggestions** (assist rows / planned dates)
- Advance managed delivery phases and status copy

Never without the human path:

- Call `scheduleOne` / publish / go-live
- Auto-spend ad budget or activate promotions
- Bypass critique

## Payments (track)

- **C1 (now):** delegated ad spend + SaaS Stripe billing
- **C2 (deferred):** prepaid credit wallet (e.g. $10) — not in this wave

## Delivery SLA

- After onboarding completes: **24h strategy + calendar** SLA (`strategyDueAt` = onboarding + 24h)
- Rolling **30-day** calendar maintained via background jobs (`processDueManagedDeliveries` on the scheduler tick)

## Client portal surfaces (only)

1. Approvals  
2. Calendar  
3. Payments  
4. Help  
5. Assets *(later)*

No self-serve publish console in the client portal.

## Hard locks (preserved)

- Critique gate untouched  
- Never import store from feature code — use `@/lib/db`  
- All repo / audit / scope calls `await`ed  
- `logAction` on material actions  
- `appEnv()` never `NODE_ENV`  
- Isolation between tenants  
