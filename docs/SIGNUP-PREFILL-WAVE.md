# Signup pre-fill wave — scope (2026-07-11)

## Status: **IMPLEMENTED** (agents A–D + parent integration)

## Goal
Speed client/company onboarding so public data pre-fills profile fields and the human only **reviews and accepts**. Builds on Module 13 (`auto-onboarding`).

## Shipped

1. **Deepen website scrape** — schema.org / OG / tel|mailto / sameAs / logo notes / nav→services; confidence + sourceUrl; sim HTML for `harbourroasters.example`
2. **Industry templates** — `SIGNUP_DEFAULTS` + `inferBusinessTypeFromIndustry` + `signup-prefill-templates.ts`; apply sets `businessType` when missing
3. **ABN + Places** — `abn-lookup.ts`, `places-enrichment.ts`, env-gated + simulated; profile `abn` / `googlePlaceId` / `tradingHours`. **ABN alone is not unique** (one ABN → many companies by trading name). Account identity / duplicate checks use **(business name + ABN)** — see `company-identity.ts`.
4. **Looks-correct UX** — summary card, confidence groups, default high+medium, primary CTA; enrichment wired into same review list

## Env (optional live)
- `AUTO_ONBOARDING_FETCH_KEY` (+ `AUTO_ONBOARDING_LIVE` in prod)
- `ABN_LOOKUP_GUID` (+ `ABN_LOOKUP_LIVE` in prod)
- `GOOGLE_PLACES_API_KEY` or `PLACES_API_KEY` (+ `PLACES_ENRICHMENT_LIVE` in prod)

## Out of scope (still parked)
- WHOIS, review scrape at signup, deep social without OAuth, self-serve payment funnel, auto-connect tokens, flipping `*_LIVE`

## Demo
Company page → Auto-onboarding scrape → consent + website → preview → optional ABN/Places enrichment → **Looks correct — apply selected**.
