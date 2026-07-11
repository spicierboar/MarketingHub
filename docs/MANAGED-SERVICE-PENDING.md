# Managed service — parked / pending

Showstoppers and deferred product work that are **out of scope for the current managed-service waves**. See also [`MANAGED-SERVICE-MODEL.md`](./MANAGED-SERVICE-MODEL.md).

## Parked — showstoppers

- **W6 live** `PUBLISHING_LIVE` / `ADS_LIVE` / `ANALYTICS_LIVE` — waiting Google Cloud billing + OAuth/GBP + Meta App Review
- **C2 prepaid credit wallet** ($10 min, auto top-up, tax-invoice suite) — owner/legal product decision; **C1 in force**
- **Unsupervised AI publish/spend without critique or authority** — **NEVER** (hard lock)

## Parked — deferred product (can build later, not this wave)

- Full client self-serve signup (currently invite/sales-assisted)
- Stripe Customer Portal deep-link for portal clients (today: agency-managed billing)
- Upcoming payments engine with webhook-synced confirmed vs estimated forecasts
- Support escalation taxonomy (legal/payment dispute/security) beyond marketing requests
- 1000-client live load proof on real platforms
- `managed_exceptions` auto-schedule (only `fully_managed` gets `schedule_approved` in wave 3)
- Photo marketplace webhook settlement gap (if still open)

## Done this arc

- Foundation runner, portal calendar/payments/assets, rolling calendar, exception notify, service-level UI
- `fully_managed` critique-gated auto-schedule (`schedule_approved` → `scheduleOne` only)
- Client Help (`/client/help`) + richer Payments C1 overview (no wallet)
- Fixtures **273/273** + **20/20**
