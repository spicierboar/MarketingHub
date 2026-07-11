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

### Quality routing after AI draft

```
AI generates content
  → Quality gate (PASS / WARN / FAIL / ESCALATE)
  → Did it pass quality (PASS or WARN)?
       YES + fully_managed | managed_exceptions → auto-submit to client (IN_CLIENT_REVIEW)
       YES + approval → hold for staff (IN_AGENCY_REVIEW)
       NO (FAIL / ESCALATE) → hold for staff (IN_AGENCY_REVIEW)
```

- **Auto-submit:** `pending_approval` + `clientReview` pending + email “Your content is ready for review”. Staff do not need to touch it. **Never publishes.**
- **Hold:** appears on Dashboard exceptions as **Needs attention** (`quality_hold`). Staff review, then **Submit to client review**.
- Engine: `src/lib/managed-service/quality-routing.ts`. Wired from Content Studio drafts, Submit for approval, **managed delivery runner**, and **campaign pack share**.

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

## Agency vs client surfaces (automation-first)

Rule: **AI and delivery run at agency level; clients review outcomes.**  
Do not put agency planning tools on the client portal, and when the agency is looking at one client, keep **delivery** above **planning**.

| Concern | Agency (`/…`) | Client portal (`/client/…`) |
|--------|----------------|------------------------------|
| Who operates | Staff / AI runners | Business owner / approver |
| Job | Plan, draft, schedule, publish path | Approve, glance schedule, ask |
| Seasonal / AU event prompts | Yes — portfolio + agency planning | **Never** |
| AI calendar assist / scan | Yes — creates `ai_draft` only | **Never** |
| Optimal post windows | Yes — advisory for staff | **Never** (agency schedules) |
| Month grid of posts | Portfolio or one client | Own posts only (“Your calendar”) |
| Approvals | Exception desk + Approvals | Primary inbox |
| Studio / Brand Brain / ads | Yes | **Never** |
| Ready-made promos | Catalog admin + mark on calendar | Pick promo → request only |
| Publish / spend | Critique + human path | Approve content; no publish console |

### Calendar specifically

1. **Agency · All clients** — portfolio planning: seasonal prompts, assist scan, optimal windows, multi-client grid.  
2. **Agency · One client (`?company=`)** — **delivery first** for that client. Assist, seasons, campaigns, and windows must be **scoped to that company id** (no other-client leak). Agency planning sits under an explicit section. Context bar labels **Agency tools**, not the client portal.  
3. **Client portal calendar** — only their scheduled posts + move/pause asks + promo “not on calendar yet”. No seasonal wall, no scan, no industry defaults.

Automation still drafts and tops up calendars in the background; clients see **results**, not the machinery.

## Client portal surfaces (only)

1. Home (status)  
2. Approvals  
3. **Ready-made promotions** (industry templates — dates, budget, channels; agency markup)  
4. Calendar  
5. Results  
6. Files  
7. Business profile (editable changeable fields only — ABN / legal name locked)  
8. Billing  
9. Ask us  
10. Help  

Nav is review-first. No self-serve publish console in the client portal.

### Ready-made promotions

- Catalog in `src/lib/promo-catalog.ts` (retail, restaurant, fast food, hotel, professional, general).
- Client picks template → sets **start/end**, **media budget**, **channels** only.
- Agency **markup** (`managedService.promoMarkupPercent`, default 15%) shown as management fee.
- Spawns a **draft campaign** (never published). Stays **not on calendar** until agency marks it.
- UI: client Home + `/client/promos`; calendar callout; company overview markup + “Mark on calendar”.


## Hard locks (preserved)

- Critique gate untouched  
- Never import store from feature code — use `@/lib/db`  
- All repo / audit / scope calls `await`ed  
- `logAction` on material actions  
- `appEnv()` never `NODE_ENV`  
- Isolation between tenants  
