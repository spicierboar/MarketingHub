# Managed service — parked / pending

Showstoppers and deferred product work that are **out of scope for the current managed-service waves**. See also [`MANAGED-SERVICE-MODEL.md`](./MANAGED-SERVICE-MODEL.md).

## Parked — showstoppers

- **W6 live** `PUBLISHING_LIVE` / `ADS_LIVE` / `ANALYTICS_LIVE` — waiting Google Cloud billing + OAuth/GBP + Meta App Review
- **Unsupervised AI publish/spend without critique or authority** — **NEVER** (hard lock)

## Parked — deferred product (can build later, not this wave)

- Full client self-serve signup (currently invite/sales-assisted)
- Upcoming payments engine with webhook-synced confirmed vs estimated forecasts
- Support escalation taxonomy (legal/payment dispute/security) beyond marketing requests
- 1000-client live load proof on real platforms
- `managed_exceptions` auto-schedule (only `fully_managed` gets `schedule_approved` in wave 3)
- Photo marketplace webhook settlement gap (if still open)
- Full client self-serve signup funnel (payment/plan in 90s) — **pre-fill wave shipped** (scrape deepen + templates + ABN/Places + Looks-correct); see `docs/SIGNUP-PREFILL-WAVE.md`

## Done this arc

- Foundation runner, portal calendar/payments/assets, rolling calendar, exception notify, service-level UI
- `fully_managed` critique-gated auto-schedule (`schedule_approved` → `scheduleOne` only)
- Client Help (`/client/help`) + richer Payments C1 overview (no wallet)
- **C2 prepaid credit wallet** ($50 min floor, ledger, simulated auto top-up; gates on spend apply / activate / save budget)
- **C2 follow-ons:** Stripe Checkout top-up (`kind=credit_top_up`) + webhook credit · local tax-invoice suite (GST, list/print, credit notes/void, management-fee invoices)
- **Platform improvements wave:** nested company-form fix · send campaign pack to client Approvals · exception deep-links (credit / reconnect) · letterhead helper · off-session auto top-up + saved PM (migration **0041**) · client Stripe portal · closed-loop Results snapshot · guided checklist (service level + first campaign) · vertical playbook default channels · chunked `.in(company_id)` lists
- Fixtures **291+** (+ platform improvement checks)

## Owner env (optional, production polish)

```
TAX_INVOICE_SELLER_NAME=
TAX_INVOICE_SELLER_ABN=
TAX_INVOICE_SELLER_ADDRESS=
TAX_INVOICE_SELLER_EMAIL=
```

Paste migration:
`notepad F:\MarketingHub\command-centre\supabase\migrations\0041_credit_wallet_stripe_pm.sql`
