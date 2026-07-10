# M50 — Bookings & reservations handoff (2026-07-10)

**Agent:** M50-W7-Bookings · **Branch:** `main`

`m50_handoff=yes`

## Shipped

- `/bookings` — service periods, settings, reservation queue (admin)
- `/book/[companyId]` — guest reservation request form (public)
- `src/lib/bookings.ts` + `src/lib/bookings-connectors.ts` — `BOOKINGS_LIVE` gate, state machine, capacity
- `src/lib/bookings-public.ts` — public storefront loader
- Migration `0034_bookings.sql`
- Add-on `bookings` (restaurant segment, A$79/mo, 📅)
- Self-test `bookings.*` wired into `/api/dev/self-test`
- Café seed: `ent_cafe_bookings`, lunch service period, sample reservation

## Gate

`BOOKINGS_LIVE` — off in dev/staging (default). When off, guest requests auto-confirm (`confirmationMode: simulated`). Set `true` for live provider integration (placeholder dispatch).

## Fixtures

```bash
curl http://localhost:3000/api/dev/self-test
# checks: bookings.simulatedWhenLiveOff, bookings.stateMachine, bookings.createReservation, bookings.tenantIsolation
```

## Next

Owner applies migration `0034_bookings.sql` to Supabase when ready. Do not flip `BOOKINGS_LIVE` until live provider is configured.
