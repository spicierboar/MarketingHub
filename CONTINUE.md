# Command Centre — authoritative continuation

Use `C:\Projects\command-centre` on
`feature/managed-service-platform`. Also read
`C:\Projects\Content-Stack-HANDOVER.md`.

All work is intentionally uncommitted. Do not reset, clean, discard, stash,
overwrite, commit, branch, push, or open a PR without explicit user approval.
Never expose or commit secrets, tokens, real env files, `.vercel`, logs, local
databases, generated output, or OIDC data. The user parked the `F:\` migration;
this `C:\` repository remains authoritative.

## Backlog PR (post-split foundations)

Parked Content Stack backlog stubs ship on branch
`backlog/post-split-foundations` (base `split/10-billing-onboarding-glue`):
plan-seeded strategy/guardrails, sales home, salesperson on agency clients,
autopilot T−7/T−3 + publish-day auto-approve scaffolding (email gated off),
AI brief draft stub, and client portal hub stubs.

Human review / copy / secrets checklist:
`C:\Projects\Content-Stack-PLACEHOLDERS.md`

Live flags stay off. Do not apply staging migrations from this backlog branch.

## Role and current state

Command Centre is the system of record and authoritative control plane for
tenant/identity scope, entitlements, strategy, schedules, rights, billing,
approvals, audit, publishing governance, workflow transitions, and Engine job
submission/status. Content Desk is a thin intent client; Engine is
execution-only.

Logic-boundary, delegated identity, cron/scheduler, provider-gating, database
security, and simulated cross-stack flow work is complete. Authenticated cron,
scheduler concurrency/database-clock leases, callback/polling, approval,
reconciliation, provider tests, and builds passed. All runtime-bypass findings
are fixed. Command Centre live activation requires `VERCEL_ENV=production`,
or, off Vercel, `CC_ENV=production` plus a non-local `APP_ORIGIN`. Content
Engine rejects every explicit non-production `VERCEL_ENV`; off Vercel, live
email also requires `CONTENT_ENGINE_ENV=production`. Key-only, Preview, local,
and indeterminate-marker states remain zero-call. See
`docs/provider-activation.env.example`. These changes remain uncommitted and
undeployed and require next-session review before provider configuration.

Stable Preview (HTTP 200; production untouched):
`https://marketing-hub-git-staging-nickmadahar-7174s-projects.vercel.app`

## Supabase

- Canonical history: 49 immutable archived legacy migrations; all effects
  verified present.
- Applied staging versions, none pending through scheduler security:
  `20260719044000`, `20260719044100`, `20260719063533`,
  `20260719070000`.
- Leaked-password protection is enabled. Current advisor baseline is 135
  warnings and zero errors.
- `20260719111346_optimize_rls_auth_initplans.sql` is intentionally unapplied.
  Final review found the SQL correctly ordered and textually equivalent, but
  blocked pending four fixes: rollback `lock_timeout`/low-traffic guidance;
  expanded auth/null/inactive/update/delete behavior tests; exact normalized
  catalog predicate comparisons; and an executable advisor-baseline comparison
  proving 135 → 129 with no new findings and unchanged deferred sets. No remote
  validation or application occurred.
- Leave 120 overlap findings deferred pending workload/action-role evidence.
  Seven authenticated functions remain accepted with explicit grants, pinned
  search paths, caller-bound authorization, and tests.
- Disposable projects were reported deleted. Current CLI inventory could not
  be refreshed during handoff; verify no hourly test project remains before
  creating another.

## External providers and review plan

- Stripe: dedicated `Content Stack` account and `Content Stack sandbox` exist,
  but OAuth/MCP is not authorized. Start fresh OAuth. Permissions: Read
  Accounts/Balance/Branding/Charges and Refunds/Payment Intents/Payment Method
  Configurations; Write Customers/Invoices/Prices/Products/Subscriptions; all
  others None, including Payment Links and Health Alerts.
- Create a separate Resend `Content Stack` team/account and fresh OAuth; never
  reuse an existing account.
- Prepare a dedicated Preview-only Groq key. Run one real generation only after
  provider-gate review/deploy, then return to mock/off.
- The unapproved PR plan has 10 Command Centre slices, 3 Engine slices, and
  3 Desk slices. No branches, commits, pushes, or PRs exist. Exclude secret env
  files, `.vercel`, credentials, logs, local DBs, generated `dist`, and
  temporary output.

## Next session order

1. Verify all three branches, statuses, diffs, and worktrees.
2. First database task: complete all four `20260719111346` blockers, then run
   full disposable PostgreSQL 17 replay/behavior/catalog/advisor validation.
   Do not apply it to staging.
3. Finish any remaining provider review result.
4. Fresh Stripe OAuth to `Content Stack sandbox`; configure sandbox
   products/prices/webhooks/restricted key with live flags off.
5. Create the separate Resend team; prepare the guarded Groq test.
6. Obtain user approval for the 10/3/3 PR split before repository mutations.
7. Consider staging only after disposable validation and explicit approval;
   then delete the disposable project and verify no hourly project remains.
