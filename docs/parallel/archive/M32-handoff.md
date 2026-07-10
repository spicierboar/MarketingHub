# M32 - SMS marketing handoff (2026-07-09)

**Agent:** M32-W3-SMS · **Branch:** `w3/m32-sms`

## Shipped

- `src/lib/sms.ts` — consent gates, quiet hours, country rules, segment/cost preview, campaign validation
- `src/lib/sms-connectors.ts` — Twilio drop-in stub; deterministic simulator when `SMS_LIVE` off
- `src/lib/db/*` — subscribers, settings, campaigns (in-memory + Supabase adapter)
- `supabase/migrations/0031_sms_marketing.sql` — company-scoped RLS tables
- `src/app/(app)/sms/` — admin UI (settings, subscribers, campaigns, cost preview, send)
- `src/components/app-shell.tsx` — **SMS Marketing** nav (`/sms`)
- Self-test **+7** (`sms.*`)

## Hard lock

- `SMS_LIVE` **not flipped** (simulated sends)
- `PUBLISHING_LIVE` / `ADS_LIVE` / `ANALYTICS_LIVE` **unchanged OFF**

## Owner paste (async)

```powershell
notepad F:\MarketingHub\command-centre\supabase\migrations\0031_sms_marketing.sql
```

Live keys (when ready): `SMS_LIVE=true`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`

## Fan-in

Push branch → M01-W3 when M30–M33 handoffs ready.

`m32_handoff=yes`
