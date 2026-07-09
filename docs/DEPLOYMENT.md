# Deployment — staging + live environments

Two environments, isolated by **separate Supabase projects** and separate hosting
environments. Staging mirrors production but keeps all the dev-tools open and shows
a **STAGING** ribbon; production locks the dev-tools and shows no ribbon.

| | **Staging** | **Production (live)** |
|---|---|---|
| Purpose | test everything before it hits real clients | real clients |
| Env | `CC_ENV=staging` (or Vercel Preview → auto) | `CC_ENV=production` (or Vercel Production → auto) |
| Supabase project | a **separate** staging project | the live project (`hrwkshspqeulgrmpqtpx`) |
| Dev-tools (`/api/dev/self-test`, `/api/dev/queue-test`) | **open** | **locked** (403 unless `CC_SELFTEST_SECRET`) |
| Env ribbon | shown (fuchsia "STAGING") | hidden |
| Publishing / ads / AI | keep `*_LIVE` **off** (simulate) until you deliberately test live | on once approvals land |
| Stripe | test-mode keys | live keys |

## How the environment is decided (`src/lib/env.ts`)

`appEnv()` resolves in this order: **`CC_ENV`** → **`VERCEL_ENV`** (production→production,
preview→staging, development→development) → `NODE_ENV`. **Why not `NODE_ENV`:** a
Vercel *preview* (staging) build sets `NODE_ENV=production`, so gating dev-tools on
`NODE_ENV` would wrongly lock them on staging. Everything env-sensitive uses
`appEnv()`/`devToolsOpen()`/`envRibbonLabel()`, never `NODE_ENV` directly (except
cookie `secure`, which correctly follows HTTPS).

## Recommended setup — Vercel + two Supabase projects

1. **Two Supabase projects:** the existing live one, plus a new **staging** project.
   Apply migrations `0001 → 0009` (in order) to BOTH via the SQL editor. Keep them
   separate so staging test data never touches live client data.
2. **One Vercel project** with two environments:
   - **Production** → the live domain; env vars point at the LIVE Supabase project +
     live Stripe + `PUBLISHING_LIVE`/`ADS_LIVE` as approvals land. `CC_ENV` unset
     (Vercel sets `VERCEL_ENV=production`).
   - **Preview** = staging → a preview URL (or a `staging.` domain); env vars point at
     the STAGING Supabase project + Stripe test keys + `*_LIVE` off. `CC_ENV` unset
     (Vercel sets `VERCEL_ENV=preview` → staging). Push to a `staging` branch to deploy.
   - Set each var's scope (Production vs Preview) in Vercel → Settings → Environment
     Variables so the two never share a Supabase URL or Stripe key.
3. **Cron** (`vercel.json` → `/api/cron/tick`) runs per-deployment; set `CRON_SECRET`
   in both. Staging's cron drives the staging queue against the staging DB only.
4. **`CC_SELFTEST_SECRET`** — set in **production** so an operator/CI can still run the
   self-test/queue-test there with the secret; leave unset in staging (open).
5. **`APP_ORIGIN`** — set per environment to that environment's canonical URL (closes
   host-header spoofing on OAuth/Stripe redirects).

## Self-hosted (non-Vercel)

Set `CC_ENV=staging` or `CC_ENV=production` explicitly. Two instances, each with its
own Supabase project + env file. Behind a corporate TLS proxy use
`npm run start:supabase` / `npm run dev:supabase` (see HANDOVER.md).

## Environment parity check

The permanent fixtures are the staging smoke test: after a staging deploy, hit
`GET /api/dev/self-test` and `GET /api/dev/queue-test` — both must be **200 / all
green** (they provision throwaway tenants, assert isolation + queue invariants, and
purge). In production the same routes require `CC_SELFTEST_SECRET`. The migration
round-trip scripts (`scripts/verify-*-supabase.mjs`) validate a new Supabase project
end-to-end before you point traffic at it.

## Env-var checklist (per environment)

`NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY`
· `APP_ORIGIN` · `CRON_SECRET` · `CC_SELFTEST_SECRET` (prod only) · `RESEND_API_KEY`
· `ANTHROPIC_API_KEY` · `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`STRIPE_PRICE_*`
· `PUBLISHING_LIVE`/`PUBLISHING_TOKEN_KEY` + shared OAuth · `ADS_LIVE` · `ANALYTICS_LIVE`
· `SUPABASE_MEDIA_BUCKET` · `CC_TZ_OFFSET_MINUTES` (e.g. 600). Keep `*_LIVE` OFF on
staging unless you're deliberately exercising a live integration there.
