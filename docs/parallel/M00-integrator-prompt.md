# Agent M00-Integrator — Batch 8 (FINAL V1 builder merge)

**Chat title:** `M00-Integrator`

---

```
AGENT NAME: M00-Integrator
Path: F:/MarketingHub/command-centre

READ FIRST:
1. docs/parallel/M01b-handoff.md
2. HANDOVER.md "▶ NEXT SESSION — START HERE" only

CONTEXT:
- Batch 8 solo: M01b publish idempotency — **last V1 builder**.
- Modules 2–15 DONE on main. M14 migration 0027 still pending owner paste.
- No new migration from M01b.
- Orchestrator pre-check: self-test 67/67 · queue-test 20/20.

BRANCH: main → v1-m01-idempotency
(If no git: reconcile handoff vs disk.)

SANITY CHECKS:

A. Migrations — no new files from M01b; 0027 still owner-pending

B. Module 3 preservation — critique gate intact

C. M01b feature checks
- [ ] publishIdempotencyKey + resolvePriorPublish in publish-queue.ts
- [ ] retry / stale-claim skip re-send when already published
- [ ] [idem:…] in publish_logs detail
- [ ] Self-test: publishIdempotency.retrySkipsWhenAlreadyPublished, staleClaimSafeRecovery, logRecordsDedupeKey
- [ ] Queue-test: queue.idempotentRetrySkipsResend, queue.staleClaimRecoversPublished

D. Build + fixtures → 67/67 · 20/20

HANDOVER UPDATE:
- Module 1: mark publish idempotency ✅; keep Resend/live keys as owner-only remainder (or mark module 1 DONE for builder scope with owner checklist)
- Header: batch 8 integrated — **V1 builder track COMPLETE**
- NEXT: owner ops only — 0027 paste · Meta+Google+Resend on mangotickle.com.au (parked) · V2 deferred
- Domains note (if missing): mangotickle.com.au / mangotickle.com
- Archive M01b-handoff.md → docs/parallel/archive/
- Update BUSINESS-ROADMAP strikethrough for publish idempotency

OUTPUT:
1. Merge summary
2. Sanity pass/fail
3. Final V1 status (15/15 builders vs owner remainder)
4. Owner notepad for 0027 if still pending

DO NOT rebuild M01b — integrate + HANDOVER only.
```
