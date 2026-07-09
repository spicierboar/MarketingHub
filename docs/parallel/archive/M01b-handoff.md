# M01b — Publish idempotency handoff (2026-07-08)

## Shipped

- **Engine:** `src/lib/publish-queue.ts` (primary ownership)
  - `publishIdempotencyKey(scheduledPostId, attempt)` — per-attempt dedupe key `pub:{id}:a{n}`
  - `publishIdempotencyKeyFromPlatform` — alternate key when platform message id known
  - `resolvePriorPublish` — verify `publish_logs` + in-memory sim registry before re-send
  - `withIdempotencyDetail` / `idempotencyKeyFromDetail` — `[idem:…]` marker in log detail (no migration)
  - `registerSimulatedPublish` / `lookupSimulatedPublish` — deterministic sim dedupe across stale-claim
  - **`publishPostNow`** — short-circuits to idempotent `published` log when prior outcome found
  - **`processPublishQueue` stale-claim** — verifies prior publish before marking failed; recovers to `published` when log/registry proves delivery
- **Publishing layer (minimal):** `src/lib/publishing.ts`
  - `attemptScheduledPost` accepts optional `idempotencyKey` + sim registry callbacks
  - Simulated connector: deterministic post id from key hash; returns "Already published" on key hit
- **DB (fixture support):** `updateScheduledPost` respects explicit `updatedAt` when patched (in-memory + Supabase adapter) so stale-claim fixtures can backdate rows
- **Self-test:** +3 in `src/lib/selftest/publish-idempotency.ts`
  - `publishIdempotency.retrySkipsWhenAlreadyPublished`
  - `publishIdempotency.staleClaimSafeRecovery`
  - `publishIdempotency.logRecordsDedupeKey`
- **Queue-test:** +2 in `src/lib/selftest/queue.ts`
  - `queue.idempotentRetrySkipsResend`
  - `queue.staleClaimRecoversPublished`

## Migration

**None** — idempotency state lives on existing `scheduled_posts` + append-only `publish_logs` (`[idem:…]` in `detail`).

## Do not touch (integrator)

- `HANDOVER.md` — integrator updates after M00 batch 8
- Modules M02–M15 libs

## Verified (2026-07-08)

```powershell
cd F:/MarketingHub/command-centre
npx tsc --noEmit          # clean
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run build             # 56 routes
npx tsx scripts/run-fixtures.mjs
# self-test 67/67 + queue-test 20/20 (M01b +3 self +2 queue)
```

## Remaining module 1 (owner-only)

- Resend magic-link + live SMTP (owner keys parked with Meta+Google)
- Live `PUBLISHING_LIVE` / `ADS_LIVE` / `VISUALS_LIVE` drop-ins when owner unblocks
- AI cost cap slice (if not already covered elsewhere)

## Next

**M00-Integrator** — merge `v1-m01-idempotency`, update `HANDOVER.md` + `PROGRESS.md`. **V1 builder track complete** after integrator lands batch 8.
