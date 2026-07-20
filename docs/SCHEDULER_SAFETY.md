# Scheduler safety contracts

## Deadlines and overlap

`/api/cron/tick` has a 90-second platform ceiling. Scheduler work is clamped to
75 seconds, reserving 15 seconds for claim release, persistence, and response
serialization. Every task slice has a child `AbortController` combined with the
global deadline. Outbound Content Engine, publishing, AI, and Resend requests
receive the bounded signal.

Tenant and task rotation uses the service-role-only
`claim_scheduler_cursor`/`release_scheduler_cursor_claim` RPCs. Claims rotate
under a row lock, carry expiring owner leases, and advance a monotonic sequence.
Overlapping ticks therefore receive different available keys. Browser roles and
`PUBLIC` have no table or function privileges; RLS is enabled and forced as
defense in depth.

The cursor RPC never accepts application time. PostgreSQL `clock_timestamp()`
is the sole clock for pruning leases, setting expiry, and updating cursor
timestamps, so worker clock skew cannot steal or prolong claims. The complete
tick runs in one scheduled execution context; the service Supabase transport
combines its request signal with that global deadline, including tenant
discovery and cursor claim/release requests.

The migration `20260719070000_scheduler_cursors.sql` is intentionally unapplied.
Apply it to a disposable environment and run
`npm run test:scheduler:concurrency` before releasing the scheduler changes.

## Unknown live deliveries

Simulation is explicit and performs no provider request. A live dispatch that
loses its response after sending is moved to `delivery_unknown`, never to a
retryable status. Stale live claims are quarantined the same way. Operators must
reconcile provider evidence before marking the post delivered or not delivered;
only a confirmed non-delivery returns it to the retry queue. Supported provider
requests receive the stable publish idempotency key.

Confirmed delivery uses the same finalizer as a normal successful provider
response, advancing the scheduled post, content item, linked campaign item, and
marketing request while preserving publish and audit history.
