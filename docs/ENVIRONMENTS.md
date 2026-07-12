# Three environments — Local · Staging · Live

Owner-facing map of how Marketing Command Centre is meant to run. Code details
and `appEnv()` rules live in [`DEPLOYMENT.md`](./DEPLOYMENT.md); production
cutover steps live in [`OWNER-LIVE-CUTOVER.md`](./OWNER-LIVE-CUTOVER.md).

| Env | Purpose | Typical URL |
|-----|---------|-------------|
| **Local** | Day-to-day coding | `http://127.0.0.1:3002` |
| **Staging** | Shared preview before live — real-ish backends, **no** production data/charges | Vercel Preview URL or `staging.mangotickle.com.au` |
| **Live** | Production clients | `https://mangotickle.com.au` |

**Hard rule:** Isolation between staging and live is **separate Supabase projects**
(different `NEXT_PUBLIC_SUPABASE_URL`). Never point Preview/staging at the live DB.

**Hard rule:** Keep all cutover `*_LIVE` flags **OFF** on staging (and on live until
Phase 4 GO in `OWNER-LIVE-CUTOVER.md`). W6 Google still waiting — do not flip.

---

## 1. Local (coding)

### How to run

```powershell
cd F:\MarketingHub\command-centre
npm install   # first time

# Preferred demo path (port 3002 + local demo auth):
powershell -ExecutionPolicy Bypass -File scripts\dev-3002.ps1
# → http://127.0.0.1:3002/login

# Or foreground:
$env:CC_LOCAL_DEMO='true'; $env:NEXT_PUBLIC_CC_LOCAL_DEMO='true'
npm run dev -- -p 3002
```

`scripts/dev-3002.ps1` starts a detached Next.js process with demo flags and logs
to `.next-dev-3002.log`.

### What local uses

| Item | Local value |
|------|-------------|
| Data | In-memory seed when `CC_LOCAL_DEMO=true` (even if Supabase keys exist in `.env.local`) |
| Auth | Demo personas / `/dev` quick login — no magic-link OTP |
| Stripe | Mock checkout OK when price IDs / secret unset |
| Publishing / ads / analytics | Simulated (`*_LIVE` unset) |
| `APP_ORIGIN` | Omit, or `http://127.0.0.1:3002` |
| `CC_ENV` | Omit (defaults to development) |

Optional: point `.env.local` at a **non-production** Supabase project and run
`npm run dev:supabase` (corporate TLS). Do **not** use the live project
`hrwkshspqeulgrmpqtpx` for casual coding.

---

## 2. Staging (shared preview)

### What exists in this repo today

- `src/lib/env.ts` — `VERCEL_ENV=preview` → `appEnv() === "staging"` (ribbon + open
  `/api/dev/self-test` / queue-test).
- `vercel.json` — hourly cron `/api/cron/tick` (runs on each deployment).
- One GitHub remote: `origin` → `https://github.com/spicierboar/MarketingHub.git`
  (branch **`main`**). No GitHub Actions workflows in-repo; deploy is **Vercel**.
- Live Supabase project id (production only): `hrwkshspqeulgrmpqtpx`.
- Docs already describe Preview = staging (`DEPLOYMENT.md`). A dedicated
  **`staging` branch** is the preferred trigger for a stable preview URL.

### Recommended model (fits existing infra)

**One Vercel project** · Production = live · Preview = staging:

1. Create a **second Supabase project** (e.g. `command-centre-staging`).
2. Paste migrations `0001` → current (same order as live) into the staging SQL editor.
3. In Vercel → Settings → Environment Variables, scope keys:
   - **Preview** → staging Supabase trio + Stripe **test** keys + `*_LIVE` unset/`false`
   - **Production** → live Supabase + live Stripe (when ready) — see cutover doc
4. Create / push a **`staging` branch** (owner action if credentials needed):

   ```powershell
   git checkout main
   git pull origin main   # when you intend to update staging from main
   git checkout -B staging
   git push -u origin staging
   ```

   Vercel Preview deploys on push to `staging` (and on PRs). Optional: add custom
   domain `staging.mangotickle.com.au` → Preview in Vercel Domains.

5. Set Preview `APP_ORIGIN` to that staging URL (no trailing slash).
6. Smoke: open the Preview URL → fuchsia **STAGING** ribbon →
   `GET /api/dev/self-test` and `/api/dev/queue-test` should be **200 / all green**.

### Staging must stay OFF / safe

| Flag / key | Staging |
|------------|---------|
| `PUBLISHING_LIVE`, `ADS_LIVE`, `ANALYTICS_LIVE`, `VISUALS_LIVE`, … | **OFF** |
| Stripe | **Test-mode** keys only (`sk_test_…`) |
| Supabase | Staging project only — never live |
| `CC_LOCAL_DEMO` | **OFF** (real auth against staging Supabase) |
| Production data | Never copy client PII from live without a deliberate, documented scrub |

Code also soft-blocks publishing / local-SEO live on `appEnv() === "staging"`, and
refuses cutover live flags when `APP_ORIGIN` looks like localhost (see `env.ts`).

---

## 3. Live (production)

Canonical origin: **`https://mangotickle.com.au`** (`mangotickle.com` → redirect).

| Item | Live |
|------|------|
| Branch | Vercel **Production** ← `main` |
| Supabase | `hrwkshspqeulgrmpqtpx` |
| Ribbon | None |
| Dev-tools | Locked unless `CC_SELFTEST_SECRET` |
| `*_LIVE` | Stay **false** until Phase 4 GO (`OWNER-LIVE-CUTOVER.md`) — Google billing still blocked |
| Stripe | Live keys only when you intentionally take real payments; package price IDs `STRIPE_PRICE_PACKAGE_*` |

Full DNS / Resend / Meta / Google checklist: **`docs/OWNER-LIVE-CUTOVER.md`**.

---

## Env var matrix (checklist)

| Variable | Local | Staging (Preview) | Live (Production) |
|----------|-------|-------------------|-------------------|
| `CC_ENV` | omit / `development` | omit (`VERCEL_ENV=preview`) or `staging` | omit (`VERCEL_ENV=production`) |
| `CC_LOCAL_DEMO` + `NEXT_PUBLIC_CC_LOCAL_DEMO` | **`true`** for demo | unset | unset (ignored in production anyway) |
| `APP_ORIGIN` | omit or `http://127.0.0.1:3002` | staging URL | `https://mangotickle.com.au` |
| `NEXT_PUBLIC_SUPABASE_*` + `SUPABASE_SERVICE_ROLE_KEY` | omit (demo) or staging project | **staging** project | **live** project |
| `CRON_SECRET` | optional | set | set |
| `CC_SELFTEST_SECRET` | omit | omit (devtools open) | set |
| `RESEND_API_KEY` / `EMAIL_FROM` | omit | optional test domain | production domain |
| `ANTHROPIC_API_KEY` | optional | optional | optional |
| Stripe `STRIPE_SECRET_KEY` / webhook / `STRIPE_PRICE_*` | omit → mock | **test** keys | **live** keys when ready |
| `PUBLISHING_TOKEN_KEY` | omit | optional | set before OAuth cutover |
| `PUBLISHING_LIVE` / `ADS_LIVE` / `ANALYTICS_LIVE` / `VISUALS_LIVE` | OFF | **OFF** | OFF until Phase 4 |
| OAuth `META_*` / `GOOGLE_OAUTH_*` | omit | omit or test apps | set in prep; used at Phase 4 |
| `ABN_LOOKUP_GUID` | optional | optional (live ABR allowed in staging/dev when GUID set) | needs `ABN_LOOKUP_LIVE=true` in production |
| `ABN_LOOKUP_LIVE` | n/a | n/a (dev/staging already allow when GUID set) | `true` only when you want live ABR in prod |
| `CC_TZ_OFFSET_MINUTES` | optional | `600` (AEST) | `600` |

Copy-paste templates: **`.env.example`** (Local / Staging / Live sections).

---

## Actions only the owner can do

1. **Vercel** — confirm project linked to `spicierboar/MarketingHub`; Production = `main`; Preview env vars scoped; optional `staging.` domain.
2. **Create Supabase staging project** — new project + paste migrations; never share live service-role key with Preview.
3. **`git push -u origin staging`** — if the remote branch does not exist yet (needs GitHub credentials).
4. **DNS / TLS** — `mangotickle.com.au` (+ optional staging subdomain).
5. **Stripe** — test vs live keys; webhook endpoints per environment (`/api/billing/webhook`).
6. **Google / Meta** — billing, App Review, OAuth redirect URIs for **live** origin (parked until cutover).
7. **Flip `*_LIVE`** — only after Phase 4 GO/NO-GO; never “to test UX”.

---

## Related

- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — `appEnv()` contract, Vercel Production vs Preview
- [`OWNER-LIVE-CUTOVER.md`](./OWNER-LIVE-CUTOVER.md) — mangotickle.com.au phased go-live
- [`PRODUCTION.md`](./PRODUCTION.md) — broader production wiring
- `src/lib/env.ts` — `appEnv()`, `localDemoEnabled()`, `liveIntegrationsAllowed()`
