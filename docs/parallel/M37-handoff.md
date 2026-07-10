# M37 — Loyalty, offers & referrals handoff (2026-07-10)

**Agent:** M37-W4-Loyalty · **Branch:** `w4/m37-loyalty`

`m37_handoff=yes`

## Shipped

- `/loyalty` — tiers, members, coupons, referrals, redemption tracking
- `src/lib/loyalty.ts` + `src/lib/loyalty-connectors.ts` — `LOYALTY_LIVE` gate, CRM/email/SMS segment hooks
- Migration `0032_loyalty.sql`
- Self-test `loyalty.*` (+7) wired into `/api/dev/self-test`

## Gate

`LOYALTY_LIVE` — off in dev/staging; set `true` + `LOYALTY_API_KEY` for production adapter.

## Next

M01-W4 fan-in after M34–M36 handoffs ready
