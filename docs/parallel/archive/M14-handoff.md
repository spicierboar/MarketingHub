# M14 — Photographer marketplace handoff (2026-07-08)

## Shipped

- **Engine:** `src/lib/photo-marketplace.ts`
  - `photoMarketplaceLive()` / `photoMarketplaceStripeReady()` — gated on `appEnv()` + `STRIPE_SECRET_KEY` + `PHOTO_MARKETPLACE_LIVE` (production)
  - `listBrowsablePhotographers()` — platform (`tenantId` null) + tenant-scoped profiles with packages
  - `bookMarketplaceShoot()` — creates `PhotoMarketplaceBooking` + linked `PhotoShoot` (`requested`); simulated payment when live off
  - `computeMarketplaceSplit()` — 15% platform fee (`MARKETPLACE_FEE_BPS`)
  - `tryReleasePhotographerPayout()` — held until shoot `completed` with deliverables (governance/DAM path)
- **Stripe:** `src/lib/photo-marketplace-stripe.ts` — Connect destination checkout + `application_fee_amount` (mirrors ordering-stripe)
- **Types + DB:** `PhotographerProfile`, `PhotographerPackage`, `PhotoMarketplaceBooking`; `PhotoShoot.marketplaceBookingId`
  - In-memory seed: platform **Lens & Ladle Co.** + BrightSpark **Jade Morrison Photography**
  - Repo: `listPhotographerProfiles`, `listPhotoMarketplaceBookings`, etc. in `src/lib/db/index.ts` + supabase adapter
- **UI:** `/photographers` — browse, book package, agency bookings panel; nav link in app shell
  - `/visuals` cross-link to marketplace; shoot advance auto-attempts payout release when marketplace-linked
- **Server actions:** `src/app/(app)/photographers/actions.ts` — tenant-pinned via `assertCompanyAccess` + `assertCompanyAddon(photo)`
- **Env:** `.env.example` — `PHOTO_MARKETPLACE_LIVE`
- **Self-test:** +3 in `src/lib/selftest/photo-marketplace.ts`
  - `photoMarketplace.bookingCreatesShoot`
  - `photoMarketplace.simulatedBillingWhenLiveOff`
  - `photoMarketplace.tenantIsolation`

## Migration

**0027** — `supabase/migrations/0027_photo_marketplace.sql`

Owner apply (after 0013–0015):

```powershell
notepad F:\MarketingHub\command-centre\supabase\migrations\0027_photo_marketplace.sql
```

Extends `photo_shoots.marketplace_booking_id`; new tables: `photographer_profiles`, `photographer_packages`, `photo_marketplace_bookings`.

## Do not touch (parallel modules)

- `src/lib/publish-queue.ts` (M01b)
- `src/lib/auto-onboarding.ts`, `src/lib/security-slice.ts`
- `calendar/actions.ts` critique gate
- `HANDOVER.md` — integrator updates after batch 7

## Verified (2026-07-08)

```powershell
cd F:/MarketingHub/command-centre
npx tsc --noEmit          # clean
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run build             # 56 routes (+/photographers)
npx tsx scripts/run-fixtures.mjs
# self-test 64/64 + queue-test 18/18 (M14 +3)
```

## Next module

V1 module 1 remainder (M01b serial) — Resend magic-link · publish idempotency
