# Owner live cutover runbook — mangotickle.com.au

**Agent:** M-OWNER-OPS · **Path:** `F:/MarketingHub/command-centre`  
**Audience:** Owner / operator (no code changes required)  
**Last updated:** 2026-07-09

Phased pipeline to take Marketing Command Centre from **in-memory demo** to **production on Supabase** with real login, then (when Meta **and** Google are both ready) a **single cutover** of publishing + ads.

**Canonical URLs (lock these everywhere):**

| Purpose | URL |
|---------|-----|
| Primary origin (`APP_ORIGIN`) | `https://mangotickle.com.au` |
| Global redirect | `mangotickle.com` → `https://mangotickle.com.au` |
| Supabase Auth callback (PKCE) | `https://mangotickle.com.au/auth/callback` |
| Shared OAuth callback | `https://mangotickle.com.au/api/oauth/callback` |
| Meta lead webhook | `https://mangotickle.com.au/api/ads/leads/webhook?platform=meta_ads` |
| Google lead webhook | `https://mangotickle.com.au/api/ads/leads/webhook?platform=google_ads` |
| Stripe billing webhook | `https://mangotickle.com.au/api/billing/webhook` |

**Live Supabase project:** `hrwkshspqeulgrmpqtpx` (migrations **0001–0015 + 0027** already applied).

**Owner lock (non-negotiable):** Do **not** set `PUBLISHING_LIVE=true`, `ADS_LIVE=true`, or `ANALYTICS_LIVE=true` until **Phase 4 GO/NO-GO** passes with **both** Meta and Google tracks complete.

---

## GO / NO-GO checklist (one page)

Complete every row before calling a phase **GO**. If any row is unchecked, stay **NO-GO**.

### Phase 1 — Deploy mangotickle.com.au

| # | Check | GO |
|---|-------|:--:|
| 1.1 | Vercel project exists; Production branch deploys successfully | ☐ |
| 1.2 | DNS: `mangotickle.com.au` → Vercel; TLS certificate **Valid** | ☐ |
| 1.3 | DNS: `mangotickle.com` redirects to `.com.au` | ☐ |
| 1.4 | Production env vars set (Supabase trio, `APP_ORIGIN`, `CRON_SECRET`, `CC_TZ_OFFSET_MINUTES`, `PUBLISHING_TOKEN_KEY`) | ☐ |
| 1.5 | `PUBLISHING_LIVE`, `ADS_LIVE`, `ANALYTICS_LIVE` are **unset or `false`** | ☐ |
| 1.6 | Supabase Auth → Site URL + Redirect URLs include `/auth/callback` | ☐ |
| 1.7 | `https://mangotickle.com.au` loads (login page; no 5xx) | ☐ |
| 1.8 | `node scripts/verify-*-supabase.mjs` pass locally (`.env.local` pointed at live project) | ☐ |

### Phase 2 — Resend SMTP (magic-link login)

| # | Check | GO |
|---|-------|:--:|
| 2.1 | Phase 1 complete | ☐ |
| 2.2 | Resend domain verified for `mangotickle.com.au` (or approved subdomain) | ☐ |
| 2.3 | `RESEND_API_KEY` + `EMAIL_FROM` in Vercel Production | ☐ |
| 2.4 | Supabase Auth → SMTP configured with Resend | ☐ |
| 2.5 | Magic-link email received; click completes login at `/auth/callback` | ☐ |

### Phase 3 — Google Cloud (prep only — flags stay OFF)

| # | Check | GO |
|---|-------|:--:|
| 3.1 | Google Cloud billing **active** (no account block) | ☐ |
| 3.2 | OAuth 2.0 Web client created; redirect URI = `/api/oauth/callback` | ☐ |
| 3.3 | `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET` in Vercel (Production) | ☐ |
| 3.4 | Google Business Profile API enabled | ☐ |
| 3.5 | Google Ads API developer token **filed** (may still be pending approval) | ☐ |
| 3.6 | `PUBLISHING_LIVE` / `ADS_LIVE` still **OFF** | ☐ |

### Phase 4 — Meta + Google **single cutover**

| # | Check | GO |
|---|-------|:--:|
| 4.1 | Phases 1–3 complete | ☐ |
| 4.2 | Meta business verification **DONE** (The Great Learning Tree Pty Ltd) | ☐ |
| 4.3 | Meta App Review **approved** (publishing + ads + lead webhook permissions) | ☐ |
| 4.4 | `META_APP_ID`, `META_APP_SECRET`, `META_LEAD_WEBHOOK_VERIFY_TOKEN` in Vercel | ☐ |
| 4.5 | Meta webhook subscription verified (GET challenge returns 200) | ☐ |
| 4.6 | Google OAuth works; GBP API access granted | ☐ |
| 4.7 | Google Ads developer token **approved**; `GOOGLE_ADS_LEAD_WEBHOOK_SECRET` set | ☐ |
| 4.8 | `PUBLISHING_TOKEN_KEY` already set (Phase 1) — **do not rotate** at cutover | ☐ |
| 4.9 | **Single flip:** `PUBLISHING_LIVE=true` + `ADS_LIVE=true` (+ `ANALYTICS_LIVE` if ready) **together** | ☐ |
| 4.10 | OAuth connect on `/publishing` succeeds for Meta + Google | ☐ |
| 4.11 | Simulated → live mode confirmed (security panel / publish log shows real ids) | ☐ |

---

## Phase 1 — Deploy mangotickle.com.au (do first)

**Goal:** Production app loads on Supabase with simulated publishing/ads/analytics. Operators can reach the app; cron runs; dev-tools are secret-gated.

### Prerequisites / blockers

- Domain registrar access for `mangotickle.com.au` and `mangotickle.com` (registered 2026-07-08).
- Vercel account with GitHub (or manual deploy) access to this repo.
- Supabase live project `hrwkshspqeulgrmpqtpx` — keys from **Settings → API**.
- `PUBLISHING_TOKEN_KEY` generated once (32+ chars) — store in a password manager; **losing it makes stored OAuth tokens undecryptable later**.

### Step 1.1 — Vercel project

1. Open [vercel.com](https://vercel.com) → **Add New… → Project**.
2. Import the `command-centre` repo (or confirm an existing project).
3. **Framework Preset:** Next.js (auto-detected).
4. **Root Directory:** repository root (where `package.json` lives).
5. **Production Branch:** `main` (or your release branch).
6. Deploy once without custom domain to confirm build succeeds.

**Or confirm existing project:** Settings → General → note the project name; Production deployments should show green.

### Step 1.2 — Custom domain + DNS

**In Vercel → Project → Settings → Domains:**

1. Add **`mangotickle.com.au`** → assign to **Production**.
2. Vercel shows required DNS records. At your **.com.au registrar**, create:

| Type | Name / Host | Value | Notes |
|------|-------------|-------|-------|
| `A` | `@` | `76.76.21.21` | Vercel apex A record (confirm in Vercel UI — IP may update) |
| **or** `CNAME` | `www` | `cname.vercel-dns.com` | If using `www` subdomain |
| `CNAME` | `www` | `cname.vercel-dns.com` | Optional `www` → same app |

> Vercel's domain panel shows the **exact** records for your project — use those if they differ from the table above.

3. Add **`mangotickle.com`** (global TLD):
   - **Preferred:** Vercel domain → **Redirect** to `https://mangotickle.com.au` (308).
   - **Alternative:** Registrar HTTP 301 from `mangotickle.com` → `https://mangotickle.com.au`.

4. Wait for DNS propagation (minutes to 48 h). Vercel status should show **Valid Configuration**.

### Step 1.3 — TLS verification

1. Vercel → Domains → `mangotickle.com.au` → certificate status **Issued**.
2. Browser: open `https://mangotickle.com.au` — padlock valid, no certificate warnings.
3. Confirm `http://mangotickle.com.au` redirects to HTTPS.

### Step 1.4 — Production environment variables

**Vercel → Project → Settings → Environment Variables → Production scope only** (unless noted).

Copy-paste table — **minimum for Phase 1** ("app loads on Supabase"):

| Variable | Example / format | Required Phase 1 | Notes |
|----------|------------------|:----------------:|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://hrwkshspqeulgrmpqtpx.supabase.co` | ✅ | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ…` | ✅ | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ…` | ✅ | **Server-only** — never expose to browser |
| `APP_ORIGIN` | `https://mangotickle.com.au` | ✅ | No trailing slash |
| `CRON_SECRET` | random 32+ chars | ✅ | `openssl rand -hex 32` |
| `CC_TZ_OFFSET_MINUTES` | `600` | ✅ | AEST fallback when tenant has no IANA zone |
| `PUBLISHING_TOKEN_KEY` | random 32+ chars | ✅ | `openssl rand -base64 48` — needed before Phase 4 OAuth |
| `CC_SELFTEST_SECRET` | random 32+ chars | ✅ recommended | Enables prod self-test/queue-test with secret |
| `PUBLISHING_LIVE` | `false` | ✅ explicit | **Keep false until Phase 4** |
| `ADS_LIVE` | `false` | ✅ explicit | **Keep false until Phase 4** |
| `ANALYTICS_LIVE` | `false` | ✅ explicit | **Keep false until Phase 4** |

**Generate secrets (PowerShell):**

```powershell
# CRON_SECRET / CC_SELFTEST_SECRET
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])

# PUBLISHING_TOKEN_KEY (longer)
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```

**Redeploy** after saving env vars: Deployments → … → **Redeploy** (Production).

### Step 1.5 — Supabase Auth URL configuration

**Supabase Dashboard → Authentication → URL Configuration:**

| Field | Value |
|-------|-------|
| **Site URL** | `https://mangotickle.com.au` |
| **Redirect URLs** (add each) | `https://mangotickle.com.au/auth/callback` |
| | `https://mangotickle.com.au/**` (wildcard optional; minimum is `/auth/callback`) |

**Authentication → Providers → Email:** enable Email provider (magic link). SMTP is Phase 2 — login will not deliver until then.

**First admin:** after Phase 2 login works, sign in → map user to `app_users` (or use existing seeded admin if present).

### Step 1.6 — Post-deploy smoke tests

#### Browser

1. `https://mangotickle.com.au` — app shell loads (login page expected; magic link won't work until Phase 2).
2. No **STAGING** ribbon (production hides it per `appEnv()`).
3. `https://mangotickle.com` → lands on `.com.au`.

#### curl — infrastructure probes

```bash
# App responds (expect 200 or 307 to login)
curl -sI "https://mangotickle.com.au" | head -5

# Cron refuses without secret (expect 401)
curl -s "https://mangotickle.com.au/api/cron/tick" | jq .

# Cron accepts with secret (expect 200 + ok:true) — replace $CRON_SECRET
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "https://mangotickle.com.au/api/cron/tick" | jq .

# Self-test (production requires CC_SELFTEST_SECRET)
curl -s -H "Authorization: Bearer $CC_SELFTEST_SECRET" \
  "https://mangotickle.com.au/api/dev/self-test" | jq '.passed, .total'

curl -s -H "Authorization: Bearer $CC_SELFTEST_SECRET" \
  "https://mangotickle.com.au/api/dev/queue-test" | jq '.passed, .total'
```

Expected self-test baseline: **67/67** passed; queue-test: **20/20** passed.

#### Local Supabase migration scripts

On a machine with repo + `.env.local` pointing at the live Supabase project:

```powershell
cd F:\MarketingHub\command-centre

node scripts/verify-timezone-supabase.mjs
node scripts/verify-connect-invites-supabase.mjs
node scripts/verify-ai-hardening-supabase.mjs
node scripts/verify-paid-supabase.mjs
node scripts/verify-terms-supabase.mjs
node scripts/verify-entitlements-supabase.mjs
node scripts/verify-ordering-supabase.mjs
node scripts/verify-menus-supabase.mjs
node scripts/verify-visuals-supabase.mjs
```

Each should exit **0** and print success. Exit **3** = migration not applied (paste SQL from `supabase/migrations/`).

> **Corporate TLS:** local scripts need network access to Supabase. If behind a TLS-intercepting proxy, use `node --use-system-ca` or run from a network without interception.

### Phase 1 rollback

| Action | How |
|--------|-----|
| Remove production traffic | Vercel → Domains → remove `mangotickle.com.au` or point DNS elsewhere |
| Revert env | Delete or fix bad Supabase keys; redeploy |
| No live flags to flip | `*_LIVE` were already false |

---

## Phase 2 — Resend SMTP (enables magic-link login)

**Goal:** Operators and clients can sign in via email magic link on production. App notification emails also work.

### Prerequisites / blockers

- **Phase 1 complete** (app on `https://mangotickle.com.au`).
- Resend account at [resend.com](https://resend.com).
- DNS access to add Resend verification records for `mangotickle.com.au` (or use a verified subdomain like `mail.mangotickle.com.au`).

> **No workaround for browser login:** the app uses PKCE via `/auth/callback`. Supabase must **deliver** the magic-link email. `generateLink` / implicit flows are **not** compatible.

### Step 2.1 — Resend domain verification

1. Resend → **Domains → Add Domain** → `mangotickle.com.au`.
2. Add the **SPF**, **DKIM**, and **MX** (if shown) records at your DNS registrar.
3. Wait until Resend shows **Verified**.

### Step 2.2 — Resend API key

1. Resend → **API Keys → Create API Key** (Sending access).
2. Copy key (`re_…`) — shown once.

### Step 2.3 — Vercel production env vars

| Variable | Value | Scope |
|----------|-------|-------|
| `RESEND_API_KEY` | `re_…` | Production |
| `EMAIL_FROM` | `Marketing Command Centre <noreply@mangotickle.com.au>` | Production |

> `EMAIL_FROM` domain must match a **verified** Resend domain.

Redeploy Production after saving.

### Step 2.4 — Supabase Auth SMTP (Resend)

**Supabase → Authentication → SMTP Settings → Enable Custom SMTP:**

| Field | Value |
|-------|-------|
| **Host** | `smtp.resend.com` |
| **Port** | `465` (SSL) or `587` (TLS) |
| **Username** | `resend` |
| **Password** | Your `RESEND_API_KEY` (`re_…`) |
| **Sender email** | `noreply@mangotickle.com.au` (must match verified domain) |
| **Sender name** | `Marketing Command Centre` |

Save. Supabase may send a test email — confirm delivery.

### Step 2.5 — End-to-end magic-link test

1. Browser (incognito): `https://mangotickle.com.au` → enter your email → **Send magic link**.
2. Check inbox (and spam). Link should point to Supabase auth, redirecting to `https://mangotickle.com.au/auth/callback`.
3. After click: logged-in dashboard loads.
4. Optional: Admin → Terms; publish T&C update — with `RESEND_API_KEY` set, broadcast emails send (see admin UI recipient count).

### Phase 2 verification curl

No curl substitute for full PKCE browser flow. Confirm:

- Resend dashboard → **Emails** shows `sign-in` / magic-link sends.
- Supabase → Authentication → Users shows new sign-in.

### Phase 2 rollback

| Action | How |
|--------|-----|
| Disable SMTP | Supabase → SMTP → disable custom SMTP (login stops) |
| Remove keys | Delete `RESEND_API_KEY` from Vercel; redeploy |

---

## Phase 3 — Unblock Google Cloud billing + OAuth (parallel prep)

**Goal:** Google OAuth credentials and API access ready. **Do not** flip `PUBLISHING_LIVE` or `ADS_LIVE` yet.

**Current blocker (2026-07-09):** Google Cloud billing **blocked** — resolve before any Google track work.

### Prerequisites / blockers

- Google Cloud account with billing profile.
- Access to [Google Cloud Console](https://console.cloud.google.com).
- Phase 1 deployed (`APP_ORIGIN` live) — OAuth redirect must hit production URL.

### Step 3.1 — Resolve billing block

1. Google Cloud Console → **Billing** → link or fix payment method.
2. Confirm project shows **Active** billing (no suspension banner).
3. If org policy blocks APIs, request admin unblock.

### Step 3.2 — Create / select project

1. **Select project** (or **New Project** e.g. `mangotickle-command-centre`).
2. Note **Project ID** for API enablement.

### Step 3.3 — OAuth consent screen

1. **APIs & Services → OAuth consent screen**.
2. User type: **External** (or Internal if Workspace-only).
3. App name, support email, developer contact.
4. **Authorized domains:** `mangotickle.com.au`.
5. Scopes (add before testing):
   - `https://www.googleapis.com/auth/business.manage` (Google Business Profile)
   - Add Google Ads scopes later when filing Ads API (Phase 4).

### Step 3.4 — OAuth 2.0 credentials (Web application)

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Type: **Web application**.
3. **Authorized redirect URIs** — add exactly:

   ```
   https://mangotickle.com.au/api/oauth/callback
   ```

4. Copy **Client ID** and **Client secret**.

### Step 3.5 — Enable APIs

**APIs & Services → Library** — enable:

| API | Purpose | Phase |
|-----|---------|-------|
| **Google Business Profile API** | GBP publishing + local audit | 3 enable / 4 live |
| **Google Ads API** | Paid ads + lead forms | 3 enable / 4 token approval |

### Step 3.6 — Google Ads API developer token (file early)

1. Sign in to [Google Ads](https://ads.google.com) with a manager account.
2. **Tools → Setup → API Center** → apply for **Developer token**.
3. Status may be **Pending** for days/weeks — **file now** while waiting on billing/Meta review.

### Step 3.7 — Vercel env vars (store only — flags stay OFF)

| Variable | Value | When live |
|----------|-------|-----------|
| `GOOGLE_OAUTH_CLIENT_ID` | `….apps.googleusercontent.com` | Phase 3 set / Phase 4 use |
| `GOOGLE_OAUTH_CLIENT_SECRET` | `GOCSPX-…` | Phase 3 set / Phase 4 use |
| `GOOGLE_ADS_LEAD_WEBHOOK_SECRET` | random 32+ chars | Phase 4 (can generate now) |
| `PUBLISHING_LIVE` | `false` | **Still false** |
| `ADS_LIVE` | `false` | **Still false** |

Redeploy after adding secrets.

### Phase 3 verification

OAuth buttons on `/publishing` remain **hidden** until `PUBLISHING_LIVE=true` (Phase 4). Verify setup indirectly:

1. Google Cloud → Credentials → redirect URI saved correctly.
2. OAuth consent screen → **Publishing status** (Testing OK for dev; Production for live users).
3. GBP API → **Enabled** in API dashboard.

Optional test (Testing mode only): manual OAuth URL in browser — should redirect to Google consent, then `https://mangotickle.com.au/api/oauth/callback` (may error until Phase 4 flip — that's expected).

### Phase 3 rollback

Remove `GOOGLE_OAUTH_CLIENT_*` from Vercel; disable APIs if abandoning Google track.

---

## Phase 4 — Meta + Google SINGLE CUTOVER

**Owner lock:** Complete **both** tracks below. Flip `PUBLISHING_LIVE` and `ADS_LIVE` **in the same Vercel save + redeploy** — never one platform live and the other simulated in production.

### Prerequisites / blockers

- Phases **1–3** complete.
- Meta **business verification DONE** (The Great Learning Tree Pty Ltd).
- Google billing **active**; OAuth creds in Vercel.
- `PUBLISHING_TOKEN_KEY` already set in Phase 1 (**do not rotate** at cutover).
- Meta App Review + Google Ads developer token **approved** (long external gates).

---

### Track A — Meta

#### A.1 — Meta Developer App

1. [developers.facebook.com](https://developers.facebook.com) → **My Apps → Create App** (or use existing).
2. Use case: **Business** (or appropriate for Pages + Marketing API).
3. Note **App ID** and **App Secret** (Settings → Basic).

#### A.2 — Permissions (App Review)

Request advanced access for (minimum):

| Permission | Use |
|------------|-----|
| `pages_manage_posts` | Facebook publishing |
| `pages_read_engagement` | Page insights / validation |
| `business_management` | Business asset access |
| `ads_management` | Paid ads execution |
| `leads_retrieval` | Lead Ads webhook ingestion |
| `pages_show_list` | Page picker during OAuth |

**App Review checklist before submit:**

- [ ] Business verification **approved** (The Great Learning Tree Pty Ltd)
- [ ] Privacy Policy URL live on `https://mangotickle.com.au` (or linked site)
- [ ] App icon + screencast demonstrating OAuth connect + publish flow
- [ ] Webhook test instructions for reviewers
- [ ] `https://mangotickle.com.au/api/oauth/callback` in **Valid OAuth Redirect URIs**
- [ ] Data handling disclosures for leads (no raw PII stored beyond product need)

#### A.3 — Webhook (Lead Ads)

**Meta App → Webhooks → Page** (or Leadgen product):

| Field | Value |
|-------|-------|
| **Callback URL** | `https://mangotickle.com.au/api/ads/leads/webhook?platform=meta_ads` |
| **Verify Token** | Same value as `META_LEAD_WEBHOOK_VERIFY_TOKEN` env var |
| **Fields** | `leadgen` |

Subscribe after Phase 4 flip (`ADS_LIVE=true`). Verification GET only succeeds when `ADS_LIVE=true`.

#### A.4 — Meta env vars (Vercel Production)

| Variable | Value |
|----------|-------|
| `META_APP_ID` | App ID |
| `META_APP_SECRET` | App Secret |
| `META_LEAD_WEBHOOK_VERIFY_TOKEN` | random string (you choose; must match Meta webhook config) |

---

### Track B — Google

#### B.1 — GBP API access

1. Confirm **Google Business Profile API** enabled (Phase 3).
2. OAuth consent screen in **Production** (if serving external users).
3. Test user added during Testing mode, or publish app.

#### B.2 — Google Ads API

1. Developer token status **Approved** (API Center).
2. Link Google Ads manager account to Cloud project if required.
3. Configure lead form extensions to POST to:

   ```
   https://mangotickle.com.au/api/ads/leads/webhook?platform=google_ads
   ```

4. Set webhook signing secret:

| Variable | Value |
|----------|-------|
| `GOOGLE_ADS_LEAD_WEBHOOK_SECRET` | random 32+ chars (must match Google Ads lead webhook config) |

---

### Single flip moment

**When GO/NO-GO Phase 4 rows 4.1–4.8 are checked:**

1. Vercel → Environment Variables → **Production** — set **in one edit**:

| Variable | New value |
|----------|-----------|
| `PUBLISHING_LIVE` | `true` |
| `ADS_LIVE` | `true` |
| `ANALYTICS_LIVE` | `true` *(only if CRM/Insights ready; else omit or `false`)* |

2. Confirm already present: `PUBLISHING_TOKEN_KEY`, `META_APP_*`, `GOOGLE_OAUTH_*`, `META_LEAD_WEBHOOK_VERIFY_TOKEN`, `GOOGLE_ADS_LEAD_WEBHOOK_SECRET`, `APP_ORIGIN`.

3. **Redeploy Production** (single deployment activates both platforms).

4. Meta → Webhooks → **Verify and Save** (subscription challenge).

---

### Post-flip verification

#### OAuth connect (`/publishing`)

1. Log in as tenant admin.
2. **Publishing** → **Connect with Facebook** → consent → returns to app with connected integration.
3. Repeat **Connect with Google** (Google Business Profile).
4. Security / AI Control panel should show **live** (not simulated) for publishing.

#### Meta webhook verify (curl)

```bash
# Replace $TOKEN with META_LEAD_WEBHOOK_VERIFY_TOKEN
curl -s "https://mangotickle.com.au/api/ads/leads/webhook?platform=meta_ads&hub.mode=subscribe&hub.verify_token=$TOKEN&hub.challenge=test123"
# Expect: test123  (plain text 200)
```

Without `ADS_LIVE=true` this returns **503** — that's correct pre-flip.

#### Simulated → live checks

| Surface | Simulated (pre-flip) | Live (post-flip) |
|---------|---------------------|------------------|
| `/publishing` OAuth buttons | Hidden | Visible |
| Publish log after test post | `simulated` id | Real platform post id |
| `/companies/[id]/local-seo` GBP audit | Simulated snapshot | Live GBP data (if connected) |
| Paid ads dashboard | Seeded metrics | Platform-reported metrics |
| Lead webhook POST | 503 `ads not live` | 200 `received: true` (with valid signature) |

#### Self-test (optional, post-flip)

```bash
curl -s -H "Authorization: Bearer $CC_SELFTEST_SECRET" \
  "https://mangotickle.com.au/api/dev/self-test" | jq '.passed, .total'
```

Still expect **67/67** — live flags don't break isolation tests.

#### Low-stakes live publish test

1. Create draft content → approve → schedule or publish now.
2. Confirm publish log shows **real** Meta/GBP id (not `sim-…`).
3. Verify post appears on the connected Page/location.

---

### Phase 4 rollback

**Immediate (no redeploy):**

| Variable | Rollback value |
|----------|----------------|
| `PUBLISHING_LIVE` | `false` |
| `ADS_LIVE` | `false` |
| `ANALYTICS_LIVE` | `false` |

Redeploy Production. App reverts to deterministic simulators; connected tokens remain encrypted in DB (safe to leave).

**If bad publish occurred:** use in-app publishing kill switch / crisis mode; pause scheduled queue; disconnect OAuth integrations from `/publishing`.

**Do not delete `PUBLISHING_TOKEN_KEY`** on rollback — that would brick decryption of stored tokens.

---

## Appendix A — Full production env var reference

Set incrementally by phase. **Staging (Vercel Preview)** should use a **separate Supabase project** and keep all `*_LIVE` false — see `docs/DEPLOYMENT.md`.

| Variable | Phase | Example |
|----------|-------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | 1 | `https://hrwkshspqeulgrmpqtpx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 1 | (anon key) |
| `SUPABASE_SERVICE_ROLE_KEY` | 1 | (service role) |
| `APP_ORIGIN` | 1 | `https://mangotickle.com.au` |
| `CRON_SECRET` | 1 | (random) |
| `CC_TZ_OFFSET_MINUTES` | 1 | `600` |
| `PUBLISHING_TOKEN_KEY` | 1 | (32+ chars) |
| `CC_SELFTEST_SECRET` | 1 | (random) |
| `PUBLISHING_LIVE` | 1=`false` → 4=`true` | `false` / `true` |
| `ADS_LIVE` | 1=`false` → 4=`true` | `false` / `true` |
| `ANALYTICS_LIVE` | 1=`false` → 4 optional | `false` / `true` |
| `RESEND_API_KEY` | 2 | `re_…` |
| `EMAIL_FROM` | 2 | `…<noreply@mangotickle.com.au>` |
| `GOOGLE_OAUTH_CLIENT_ID` | 3 | `….apps.googleusercontent.com` |
| `GOOGLE_OAUTH_CLIENT_SECRET` | 3 | `GOCSPX-…` |
| `GOOGLE_ADS_LEAD_WEBHOOK_SECRET` | 4 | (random) |
| `META_APP_ID` | 4 | (numeric) |
| `META_APP_SECRET` | 4 | (secret) |
| `META_LEAD_WEBHOOK_VERIFY_TOKEN` | 4 | (random string) |
| `ANTHROPIC_API_KEY` | optional | live AI drafting |
| `STRIPE_*` | optional | billing |
| `SUPABASE_MEDIA_BUCKET` | optional | DAM byte storage |
| `LINKEDIN_CLIENT_ID` / `SECRET` | optional | LinkedIn publishing (not in cutover lock) |

---

## Appendix B — OAuth redirect URI registry

Register **exactly** this URI on every platform OAuth app:

```
https://mangotickle.com.au/api/oauth/callback
```

| Platform | Console location |
|----------|------------------|
| Meta | App → Facebook Login → Settings → Valid OAuth Redirect URIs |
| Google | Cloud Console → Credentials → OAuth 2.0 Client → Authorized redirect URIs |
| LinkedIn (optional) | Developer portal → Auth → Redirect URLs |

---

## Appendix C — Cron schedule

`vercel.json` schedules hourly tick:

```
GET /api/cron/tick
Authorization: Bearer $CRON_SECRET
```

Manual trigger:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "https://mangotickle.com.au/api/cron/tick"
```

---

## Appendix D — Status ledger

Update `docs/parallel/PROGRESS.md` owner-ops table when each phase completes.

| Phase | Status (2026-07-09) |
|-------|----------------------|
| 1 — Deploy | ⏳ Owner executes |
| 2 — Resend SMTP | ⏳ After Phase 1 |
| 3 — Google prep | ⏳ Billing **blocked** |
| 4 — Meta+Google cutover | ⏳ Parked (Meta verification ✅; App Review pending) |

---

## Related docs

- `docs/DEPLOYMENT.md` — staging vs production, `appEnv()` contract
- `docs/PRODUCTION.md` — broader production wiring (code-oriented)
- `.env.example` — full variable list with comments
- `HANDOVER.md` — current blockers (read only; M00 updates)
