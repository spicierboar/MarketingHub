# M31 — Email marketing handoff (2026-07-09)

**Agent:** M31-W3-Email · **Branch:** `w3/m31-email`

`m31_handoff=yes`

## Shipped

- `/email-marketing` — admin UI for templates, subscribers (consent), campaigns, and send
- `src/lib/email-marketing.ts` — consent gating, `{{token}}` rendering, segment filter, Resend bulk send via existing `emailConfigured()` / `RESEND_API_KEY` pattern; simulated open/click stats when off
- `GET /api/email/unsubscribe` — one-click public unsubscribe (`?subscriber=<id>`)
- `src/lib/db/index.ts` + `store.ts` — in-memory CRUD + demo seed (Golden Wattle Motel)
- `supabase/migrations/0031_email_marketing.sql` — `email_templates`, `email_subscribers`, `email_campaigns` with RLS
- Self-test `emailMarketing.*` (+7) wired into `isolation.ts` + `/api/dev/self-test`
- Nav item **Email Marketing** in `app-shell.tsx`

## Fixtures

**110/110** self-test · **20/20** queue-test (103 baseline + 7 `emailMarketing.*`)

## Env / gates

- Sends require `RESEND_API_KEY` (reuses `src/lib/email.ts`); without it, campaigns audit-log intent and record simulated metrics only
- Consent: `marketingConsent` required; `unsubscribedAt` excludes recipients; optional segment via subscriber `tags`
- No separate `EMAIL_LIVE` flag — follows existing Resend env pattern

## Hard lock

`PUBLISHING_LIVE` · `ADS_LIVE` · `ANALYTICS_LIVE` — **not flipped**

## Owner paste

Apply `0031_email_marketing.sql` when ready for Supabase persistence.

## Next

M01-W3 fan-in after M30–M33 handoffs ready
