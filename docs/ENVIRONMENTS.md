# Three environments — Local · Staging · Live

**Audience:** Owner / operator creating environments from scratch.  
**Honest status (2026-07-12):** Day-to-day work has been **laptop-only**. There is
**no staging environment yet**. You create staging this week; live is a **later**
step (not a blocker for staging).

Code details: [`DEPLOYMENT.md`](./DEPLOYMENT.md). Live go-live later:
[`OWNER-LIVE-CUTOVER.md`](./OWNER-LIVE-CUTOVER.md).

| Env | Purpose | Typical URL | Status |
|-----|---------|-------------|--------|
| **Local** | Coding on your laptop | `http://127.0.0.1:3002` | **You already use this** |
| **Staging** | Shared cloud preview — real-ish backends, **no** client charges / live data | A Vercel Preview URL (or later `staging.mangotickle.com.au`) | **Create this first** |
| **Live** | Real clients | `https://mangotickle.com.au` | Optional later (site may already exist — see §3) |

**Hard rule:** Staging and live use **separate Supabase projects** (different
`NEXT_PUBLIC_SUPABASE_URL`). Never put live DB keys in Preview/staging.

**Hard rule:** Keep all cutover `*_LIVE` flags **OFF** on staging (and on live
until Phase 4 GO in `OWNER-LIVE-CUTOVER.md`). Do not flip them “to test UX”.

---

## Recommended path (greenfield this week)

Simplest stack for this Next.js + Supabase app:

1. Keep coding on the laptop (`scripts/dev-3002.ps1`).
2. Create accounts if you do not already have them: **Vercel** (free) + a **new
   Supabase project** named for staging. GitHub repo already exists:
   `spicierboar/MarketingHub`.
3. Import that repo into Vercel (or open the existing Vercel project if you
   already deploy mangotickle.com.au there).
4. Create the staging Supabase project → paste migrations → put **staging** keys
   only under Vercel **Preview** env vars.
5. Deploy from the existing GitHub branch **`staging`** (`origin/staging` @
   `b0fc47b`).
6. Open the Preview URL → smoke-test.
7. Live later — Production env + live Supabase; park `*_LIVE`.

You do **not** need a custom domain for the first staging deploy. Vercel gives
you a URL automatically.

---

## 1. Local (coding) — keep doing this

```powershell
cd F:\MarketingHub\command-centre
npm install   # first time only

powershell -ExecutionPolicy Bypass -File scripts\dev-3002.ps1
# → http://127.0.0.1:3002/login
```

| Item | Local value |
|------|-------------|
| Data | In-memory seed when `CC_LOCAL_DEMO=true` |
| Auth | Demo personas / `/dev` quick login |
| Stripe | Mock checkout OK when keys unset |
| Publishing / ads | Simulated (`*_LIVE` unset) |
| Cloud accounts | **None required** |

Do **not** point casual local coding at the live Supabase project
`hrwkshspqeulgrmpqtpx`.

---

## 2. Staging — create from scratch (do this week)

### What the repo already has (code only — not a live staging site)

- GitHub: `https://github.com/spicierboar/MarketingHub.git`
- Branch **`staging`** already pushed: `origin/staging` @ `b0fc47b`
- `vercel.json` — hourly cron `/api/cron/tick` (works once Vercel hosts the app)
- `src/lib/env.ts` — when Vercel sets `VERCEL_ENV=preview`, the app shows
  **STAGING** and keeps `/api/dev/self-test` open
- **No** in-repo GitHub Actions / Docker / Netlify / Railway deploy — hosting is
  meant to be **Vercel**

### Step-by-step (owner checklist)

#### A. Accounts

1. **GitHub** — you already have the repo. Confirm you can open
   `https://github.com/spicierboar/MarketingHub` and see branch `staging`.
2. **Vercel** — go to [vercel.com](https://vercel.com), sign up / log in with
   GitHub (Hobby/free is fine).
3. **Supabase** — go to [supabase.com](https://supabase.com), create a **new**
   project for staging only, e.g. `command-centre-staging` (region close to you,
   e.g. Sydney). Save the database password in your password manager.

#### B. Create or migrate the staging database schema

Use the Supabase CLI migration workflow; do not paste the archived legacy SQL
files into the SQL Editor.

- `supabase/migrations/20260719044000_command_centre_staging_canonical_baseline.sql`
  is the prepared schema-only baseline.
- `supabase/migrations/20260719044100_content_desk_delegation_replay_ledger.sql`
  is the next logical migration and remains unapplied until the baseline gate
  is complete.
- `supabase/legacy-migrations/` is immutable lineage evidence. It is not an
  active migration source.

Before establishing history on an existing project, follow
`supabase/baseline/README.md`: replay and compare the baseline in a disposable
local database, review the manifest, inspect current CLI `--help`, then repair
only the reviewed baseline version. Never use an unqualified linked
`supabase db push`.

For a new empty project, apply only reviewed active timestamp migrations in
filename order after local replay validation. Generate every future migration
with the current Supabase CLI so each version is globally unique.

#### C. Connect the GitHub repo to Vercel

1. Vercel → **Add New… → Project**.
2. Import **`spicierboar/MarketingHub`**.
3. Framework: **Next.js** (auto). Root directory: repo root (where
   `package.json` is).
4. **Production Branch:** `main` (for **later** live — you can leave Production
   undeployed / unfinished for now).
5. Do **not** hit Deploy yet until Preview env vars are set (or deploy once,
   then set vars and redeploy — either works).

**If mangotickle.com.au already shows in your Vercel dashboard:** use that
**same project**. Do not create a second project unless you intentionally want
two. You still need a **new Supabase staging project** and **Preview**-scoped
env vars.

#### D. Vercel environment variables (Preview = staging)

Vercel → Project → **Settings → Environment Variables**.

For each variable below, set scope to **Preview** only (not Production yet):

| Variable | Staging (Preview) value |
|----------|-------------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Staging project URL (Settings → API) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Staging anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Staging service_role key (**never** the live one) |
| `APP_ORIGIN` | Prefer the **stable branch Preview URL** (contains `-git-staging-`), not a one-off `*-xxxxx.vercel.app` deployment URL. Or leave blank — auth redirects use the live request host on Preview |
| `CRON_SECRET` | Any long random string (password manager) |
| `PUBLISHING_TOKEN_KEY` | A staging-only random secret (32+ chars); required for approval links even while publishing integrations stay simulated |
| `CC_TZ_OFFSET_MINUTES` | `600` (AEST) |
| `STRIPE_SECRET_KEY` | Optional: Stripe **test** key `sk_test_…` only. Key presence never enables the photo marketplace by itself |
| `PHOTO_MARKETPLACE_LIVE` / `STRIPE_BILLING_LIVE` / `EMAIL_SEND_LIVE` / `CC_AI_LIVE` / `PLACES_ENRICHMENT_LIVE` | **unset** or `false`; Preview and local demo remain simulated even if accidentally enabled |
| `RESEND_API_KEY` | Optional credential only; email remains simulated unless `EMAIL_SEND_LIVE=true` in an allowed production runtime |
| `PUBLISHING_LIVE` / `ADS_LIVE` / `ANALYTICS_LIVE` / `VISUALS_LIVE` | **unset** or `false` |
| `CC_LOCAL_DEMO` / `NEXT_PUBLIC_CC_LOCAL_DEMO` | **unset** (staging uses real Supabase auth, not laptop demo) |

Leave **Production** env vars alone until you deliberately set up live.

Provider activation is fail-closed:

- Photo marketplace Stripe requires `PHOTO_MARKETPLACE_LIVE=true` **and** a
  non-empty `STRIPE_SECRET_KEY`.
- App email requires `EMAIL_SEND_LIVE=true` **and** a non-empty
  `RESEND_API_KEY`.
- SaaS billing requires `STRIPE_BILLING_LIVE=true` **and** a non-empty
  `STRIPE_SECRET_KEY`. Stripe webhook signature verification remains inbound-
  only and does not require this outbound-call flag.
- Claude requires `CC_AI_LIVE=true` and `ANTHROPIC_API_KEY`; Places enrichment
  requires `PLACES_ENRICHMENT_LIVE=true` and a Places API key.
- Provider calls additionally require an explicit production runtime:
  `VERCEL_ENV=production`, or `CC_ENV=production` on non-Vercel hosts.
  Non-Vercel hosts must also set a non-local `APP_ORIGIN`;
  `NODE_ENV=production` alone never authorizes a provider request.
- Local demo, localhost origins, and Vercel Preview always simulate these
  providers. A key alone is inert.
- `GET /api/status` reports `live`, `simulated`, or an inconsistent
  live-flag-without-credential state without returning credential values.

#### E. Deploy the `staging` branch

1. Vercel → Project → **Settings → Git**: confirm the repo is linked.
2. Push is already done: `origin/staging` @ `b0fc47b`. If Vercel did not auto-
   deploy Preview, open **Deployments → Create Deployment** and choose branch
   **`staging`**.
3. Wait for the build (green).
4. Open the deployment → copy the **branch** Preview URL (see below), not only
   the per-deployment hash URL.
5. Set Preview `APP_ORIGIN` to that **branch** URL (no trailing slash) → Redeploy
   (optional but recommended for OAuth/Stripe; magic-link auth uses the live
   request host on Preview even if `APP_ORIGIN` is stale).
6. Optional later: Domains → add `staging.mangotickle.com.au` → assign to
   Preview.

#### Stable branch Preview URL (use this for login)

Vercel gives every deploy a unique URL (`https://<project>-<hash>-<team>.vercel.app`)
that **changes every push**. Opening Continue on one host and the email link on
another breaks magic-link login (PKCE cookie is host-bound →
“Sign-in link invalid or expired” / `otp_expired`).

Prefer the **branch alias**, which stays stable for `staging`:

`https://<project-name>-git-staging-<team-slug>.vercel.app`

How to find it:

1. Vercel → Project → **Deployments**.
2. Open the latest **`staging`** deployment.
3. Under domains / aliases, copy the URL that contains **`-git-staging-`**
   (not the long hash-only deployment URL).
4. Bookmark that URL and always request + open magic links there.

#### F. Smoke-test staging

1. Open the **branch** Preview URL — you should see a fuchsia **STAGING** ribbon.
2. Visit `https://YOUR-BRANCH-URL/api/dev/self-test` → expect **200 / all green**.
3. Visit `https://YOUR-BRANCH-URL/api/dev/queue-test` → expect **200 / all green**.
4. **Magic-link login** (staging Supabase `ccgkbyboobctqjhjiejt`):
   - Supabase → Authentication → URL Configuration:
     - **Site URL** = the same **branch** Preview URL (step above).
     - **Redirect URLs** include the wildcard already added
       (`https://*-<team>.vercel.app/**`) **and**
       `https://<branch-url>/auth/callback`.
   - In the browser: open the **branch** URL → `/login` → Continue → open the
     email **in that same browser** (do not switch to a phone mail app / another
     Preview host).
5. If login still fails with `otp_expired`, request a fresh link (links are
   single-use) and confirm Site URL is not an old deployment hash URL.

### Staging must stay safe

| Flag / key | Staging |
|------------|---------|
| `*_LIVE` cutover flags | **OFF** |
| Stripe | **Test** keys only — or omit |
| Supabase | **Staging project only** — never live `hrwkshspqeulgrmpqtpx` |
| Live client data | Do not copy production PII into staging |

---

## 3. Live (production) — later, not this week’s blocker

**What we know:** `https://mangotickle.com.au` currently answers on **Vercel**
(HTTP 200). That means *some* Vercel project + DNS already points at the domain.
It does **not** mean staging exists, and it does **not** mean you should touch
Production env vars while building staging.

| Item | Live (when you are ready) |
|------|---------------------------|
| Host | Same Vercel project · **Production** ← branch `main` |
| URL | `https://mangotickle.com.au` |
| Supabase | Live project `hrwkshspqeulgrmpqtpx` (Production env only) |
| `*_LIVE` | Stay **false** until Phase 4 GO |
| Full checklist | [`OWNER-LIVE-CUTOVER.md`](./OWNER-LIVE-CUTOVER.md) |

Until cutover is intentional: do not flip live flags; do not point Preview at
the live database.

**Option B (if live were on another host):** add a second app/service on that
same platform for staging, with its own env file + separate Supabase project,
and set `CC_ENV=staging` explicitly. This repo has no Docker/Netlify/Railway
config — for MarketingHub, **Vercel Preview is the recommended Option A**.

---

## Env var matrix

| Variable | Local | Staging (Preview) | Live (Production) |
|----------|-------|-------------------|-------------------|
| `CC_ENV` | omit | omit (`VERCEL_ENV=preview`) | omit (`VERCEL_ENV=production`) |
| `CC_LOCAL_DEMO` + `NEXT_PUBLIC_CC_LOCAL_DEMO` | **`true`** | unset | unset |
| `APP_ORIGIN` | omit or `http://127.0.0.1:3002` | Branch Preview URL (`*-git-staging-*`) | `https://mangotickle.com.au` |
| Supabase trio | omit (demo) | **staging** project | **live** project |
| `CRON_SECRET` | optional | set | set |
| `CC_SELFTEST_SECRET` | omit | omit (devtools open) | set |
| Stripe | omit unless testing live Checkout | **test** keys + every selected SKU price | live keys + every selected SKU price |
| `*_LIVE` | OFF | **OFF** | OFF until Phase 4 |
| `CC_TZ_OFFSET_MINUTES` | optional | `600` | `600` |

Provider activation template:
**`docs/provider-activation.env.example`**. It contains placeholder-only,
safe-off values and no credentials.

### Content Desk internal operator API

Configure these server-only variables in the Command Centre deployment:

- `CONTENT_DESK_INTERNAL_TOKEN`
- `CONTENT_DESK_ACTOR_SIGNING_SECRET`

Configure the matching server-only connection variables in Content Desk:

- `COMMAND_CENTRE_INTERNAL_URL`
- `COMMAND_CENTRE_INTERNAL_TOKEN`
- `COMMAND_CENTRE_ACTOR_SIGNING_SECRET`

Content Desk sends the service token as `Authorization: Bearer <token>` and a
short-lived HS256 actor delegation as `X-Content-Desk-Actor`. The delegation
contains only `iss=content-desk`, `aud=command-centre`, `sub` (the Command
Centre user id), `tenantId`, `iat`, `exp`, and `jti`. Keep the lifetime at 60
seconds exactly; each issuer/JTI is single-use. Never expose either secret to a
browser.

Command Centre verifies both credentials, then resolves the active user and
tenant membership from its own database. It does not accept role, email,
company grants, entitlement, strategy, schedule, rights, approval, publishing,
or governance metadata from Content Desk. Tenant owners/admins and members
whose authoritative `roleTitle` is `content_operator` may use the operator API;
company access is checked separately for every company-scoped request.
The guarded staging fixture stores `role` and the Command Centre selector
`tenant_id` in Supabase `app_metadata` for Admin/Staff users. Content Desk may
use those server-controlled values to select the delegation subject and tenant;
authorization must never read `user_metadata`.

---

## What NOT to do

1. Do **not** put live Supabase URL / service_role key in Preview.
2. Do **not** set `PUBLISHING_LIVE` / `ADS_LIVE` / `ANALYTICS_LIVE` / `VISUALS_LIVE`
   to test staging.
3. Do **not** use live Stripe (`sk_live_…`) on staging.
4. Do **not** turn on `CC_LOCAL_DEMO` on Vercel (that is laptop-only).
5. Do **not** treat “live site exists” as “staging is done” — staging is a
   separate Preview + separate Supabase project.

---

## Related

- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — `appEnv()` contract
- [`OWNER-LIVE-CUTOVER.md`](./OWNER-LIVE-CUTOVER.md) — live phased go-live (later)
- [`PRODUCTION.md`](./PRODUCTION.md) — broader production wiring
- `src/lib/env.ts` — `appEnv()`, `localDemoEnabled()`, `liveIntegrationsAllowed()`
