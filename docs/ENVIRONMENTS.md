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

#### B. Create staging database schema (paste migrations)

In Supabase → your **staging** project → **SQL Editor**:

1. Open each file under `F:\MarketingHub\command-centre\supabase\migrations\`
   in filename order (`0001_…`, `0002_…`, … through `0045_…`).
2. Paste the full contents into the SQL editor and **Run**.
3. Skip any `_owner_paste_*.sql` helper files — those are not the numbered
   migrations.
4. If a later migration errors because an earlier one was skipped, go back and
   apply the missing numbered file first.

Same order you would use for live. Staging starts empty — that is correct.

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
| `CC_TZ_OFFSET_MINUTES` | `600` (AEST) |
| `STRIPE_SECRET_KEY` | Optional: Stripe **test** key `sk_test_…` only — or omit (mock OK) |
| `PUBLISHING_LIVE` / `ADS_LIVE` / `ANALYTICS_LIVE` / `VISUALS_LIVE` | **unset** or `false` |
| `CC_LOCAL_DEMO` / `NEXT_PUBLIC_CC_LOCAL_DEMO` | **unset** (staging uses real Supabase auth, not laptop demo) |

Leave **Production** env vars alone until you deliberately set up live.

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
| Stripe | omit → mock | **test** keys | live keys when ready |
| `*_LIVE` | OFF | **OFF** | OFF until Phase 4 |
| `CC_TZ_OFFSET_MINUTES` | optional | `600` | `600` |

Templates: **`.env.example`**.

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
