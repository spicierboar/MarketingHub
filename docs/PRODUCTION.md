# Production go-live runbook

Everything in the app is **env-gated**: with none of these set it runs on the
in-memory store with a simulated publisher, simulated metrics, template AI and
passwordless demo sign-in — zero external accounts. This runbook flips it to a
real, persistent, multi-tenant deployment. Each phase is independent; do them in
order. Commands assume `cd F:/MarketingHub/command-centre`.

Owner-provided inputs are collected once, up front (see **§0**), so nothing here
stalls waiting on an account.

---

## §0 — Collect these first (batched owner inputs)

| Secret | Where it comes from | Enables |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase project → Settings → API | Persistence + Auth |
| `ANTHROPIC_API_KEY` (+ optional `CC_AI_MODEL`) | console.anthropic.com | Live Claude drafting (else templates) |
| `PUBLISHING_TOKEN_KEY` (32+ random chars) | generate once, store in secret manager | AES-256-GCM encryption of publishing tokens |
| `RESEND_API_KEY` (+ `EMAIL_FROM`) | resend.com | Notification + magic-link email |
| `META_APP_ID` / `META_APP_SECRET` | developers.facebook.com | Facebook/Instagram publishing |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | linkedin.com/developers | LinkedIn publishing |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | console.cloud.google.com | Google Business Profile + Google SSO |
| `ANALYTICS_LIVE=true`, optional `CRM_API_URL` / `CRM_API_KEY` | your CRM | Live analytics instead of simulated |

Generate the token key: `openssl rand -base64 48`. Store every secret in the
deployment's secret manager (Vercel/hosted env), **never** in git.

---

## §1 — Database + RLS

1. Create a Supabase project.
2. Run the migration (it creates every table + Row-Level Security mirroring
   `src/lib/auth/rbac.ts`):
   ```bash
   supabase db push
   # or, against a connection string:
   psql "$SUPABASE_DB_URL" -f supabase/migrations/0001_phase1_init.sql
   ```
3. Verify RLS is on for every table and each has a policy (a table with RLS
   enabled but no policy is deny-all):
   ```sql
   select c.relname,
          (select count(*) from pg_policies p where p.tablename = c.relname) as policies
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relrowsecurity
   order by policies, relname;   -- every row should have policies >= 1
   ```
4. Set `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`.
   From this point the app resolves auth via Supabase (`isSupabaseConfigured()`).

## §2 — Adopt the Supabase data adapter (the one code step)

The in-memory repo (`src/lib/db/index.ts`) is **synchronous**; Supabase is
network-backed and therefore **async**. The adapter (`src/lib/db/supabase-adapter.ts`)
and its row↔domain mappers are written; adopting it is mechanical:

1. Make the exported functions in `src/lib/db/index.ts` `async` (return
   `Promise<…>`), delegating to `supabaseRepo` when `isSupabaseConfigured()` and
   to the in-memory store otherwise. The signatures already match; only `async`
   changes.
2. Add `await` at the call sites. **`npx tsc --noEmit` is your checklist** — it
   flags every site where a `Promise` is used as a value, so the compiler drives
   the change to completion. The lib helpers that read the store in loops
   (`analytics.ts`, `scope.ts`, `recommend.ts`, `automation.ts`) become `async`
   and their (already-async) server-component/action callers `await` them.
3. `npx tsc --noEmit` green, then browser-verify: the demo path (env absent)
   must still pass unchanged — the async repo backed by the in-memory store
   behaves identically.

> Do this step **with the Supabase project connected** so the same pass verifies
> reads/writes against real RLS, not just the async plumbing. That's why it is
> deliberately deferred to go-live rather than shipped as an unverifiable
> big-bang refactor.

Seeding: production users come from Supabase Auth (`auth.users`), so seed by
signing in the first admin (see §3), then add companies/brand data through the
app — or write a `supabase/seed.sql` that inserts `app_users` rows keyed to the
Auth user ids you create.

## §3 — Auth (magic link / OAuth SSO / passkeys / admin 2FA)

`src/lib/auth/session.ts` already resolves a Supabase session → `app_users`
(role/roleTitle) with the `getCurrentUser`/`requireUser`/`requireAdmin`
contracts unchanged; `src/proxy.ts` (Next 16 proxy convention) refreshes the
session cookie on every request.

1. Supabase → Authentication → Providers: enable **Email (magic link)**,
   **Google**, **Microsoft (Azure)**; add **Passkeys** (WebAuthn) under
   Auth → Passkeys.
2. Set the redirect URL to `https://YOUR_DOMAIN/auth/callback` (already handled
   by `src/app/auth/callback/route.ts`).
3. Enforce **mandatory 2FA for admins** via Supabase Auth MFA + a policy hook,
   or require an authenticator enrolment on first admin login.
4. Map each Auth user to an `app_users` row (`id` = auth uid, plus `role` /
   `role_title`). The first admin: insert their `app_users` row with
   `role='super_admin'` after they first sign in.
5. Configure Resend as the Supabase Auth SMTP provider so magic-link emails
   actually send.

## §4 — Publishing (real platform posting)

`src/lib/publishing-connectors.ts` makes real Meta/LinkedIn/Google-Business/email
calls with `decryptToken(...)`; the full eligibility chain (kill switch,
crisis/sandbox, legal hold, asset-rights re-check, retries, logging) is unchanged.

1. Create the Meta / LinkedIn / Google OAuth apps; set their env vars (§0).
2. Set `PUBLISHING_LIVE=true` and `PUBLISHING_TOKEN_KEY`.
3. In the app → **Publishing**, connect each company + platform with its page/
   account token. Store the **page/account id in the account-name field** (the
   connectors post to it): Meta page id, `urn:li:organization:…`, or
   `accounts/{id}/locations/{id}`.
4. Test with one low-stakes post; confirm the publish log shows a real platform
   post id, not a `simulated id`.

## §5 — Analytics (live Insights + CRM)

`src/lib/analytics-connectors.ts` pulls platform Insights + CRM leads.

1. Set `ANALYTICS_LIVE=true` (+ optional `CRM_API_URL` / `CRM_API_KEY`).
2. As with §2, `metricsForPost()` in `analytics.ts` becomes an `await` of
   `fetchLiveMetrics()` (with the simulator as the fallback) and `buildReport()`
   goes async — tsc-guarded, verified against the live dashboard.

## §6 — Email

Set `RESEND_API_KEY` (+ `EMAIL_FROM`). `src/lib/email.ts` sends notifications;
without the key it is a safe no-op. Also wire Resend as Supabase SMTP (§3).

---

## Backup / restore / disaster recovery

- **Database — Supabase PITR:** enable Point-in-Time Recovery (Pro plan) +
  daily automated backups. Target RPO ≤ 5 min (WAL). Document RTO. **Quarterly:
  restore into a staging project and smoke-test.**
- **Assets:** metadata is in Postgres (covered by PITR); the creative bytes live
  in Canva/Figma/stock/Supabase Storage — enable **Storage backups** for those
  buckets.
- **Secrets — critical:** back up `PUBLISHING_TOKEN_KEY` in the secret manager.
  **Losing it makes every stored publishing token undecryptable.** Rotating it
  re-encrypts tokens via a migration; rotate on a schedule and on suspected
  compromise.
- **Audit trail:** `audit_logs` is append-only (RLS: insert-only, no update/
  delete) and included in PITR — the compliance record survives a restore.
- **Config:** keep `supabase/migrations/` in git; every schema change is a new
  migration (never edit a shipped one in place).

## Post-deploy verification checklist

- [ ] RLS query in §1.3 shows every table with ≥1 policy.
- [ ] A scoped user sees only their companies; cross-company URLs 404.
- [ ] Magic link + Google/Microsoft SSO sign-in works; admin 2FA enforced.
- [ ] Draft → approve → schedule → publish posts a real platform id.
- [ ] A referenced asset with rights that exclude a channel blocks scheduling.
- [ ] Publishing kill switch / crisis mode freezes publishing.
- [ ] Automation "Run now" creates drafts only — nothing auto-publishes.
- [ ] Analytics dashboard shows live (non-simulated) figures.
- [ ] Token last-four only is ever shown; no plaintext token anywhere.
