# M50 — Bookings & reservations · branch w7/m50-bookings
Spawned while W6 Google-blocked (code-only). Fan-in → M01-FINAL. See FULL-IMPLEMENTATION-PLAN W7.

Deliver: restaurant/hotel reservations (not photographer marketplace), service periods + capacity, `BOOKINGS_LIVE` gate (simulated when OFF), addon `bookings`, migration `0034_bookings.sql`, admin `/bookings` + public `/book/[companyId]`, self-test fixtures. Do not flip live flags. Do not touch M51–M55 modules.
