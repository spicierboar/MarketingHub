# Marketing Command Centre

In-house AI marketing operating system for a group of related companies.
**AI drafts → users review → admins approve → export. Nothing unapproved is published.**

## Quick start

```powershell
npm install
powershell -ExecutionPolicy Bypass -File scripts\dev-3002.ps1
# → http://127.0.0.1:3002/login
```

Runs with **no external accounts** — seeded in-memory data + `CC_LOCAL_DEMO`.
Prefer `/dev` quick login. **Environments (local / staging / live):**
[`docs/ENVIRONMENTS.md`](./docs/ENVIRONMENTS.md).

## Status

**All 12 phases complete and verified** (MVP · Brand Brain · Approval &
Compliance Engine · Campaign Planner · Content Studio · Social Calendar ·
Automated Publishing · Analytics & Reporting · AI Recommendation Engine ·
Advanced Admin & Security · **Creative Asset System** · **Enterprise Automation**).
The production-wiring path (Supabase persistence + Auth, real Meta/LinkedIn/GBP/
email connectors, live analytics, Resend email) is **code-complete behind env
checks** — the demo still runs with zero external accounts; live verification
awaits the owner's credentials.

See [HANDOVER.md](./HANDOVER.md) for the full feature list, the per-phase
adversarial reviews, the production-wiring status, and the batched go-live
checklist. The full product spec lives in the master prompt at
`../complete_ai_marketing_platform_master_prompt.docx`.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 · Server Actions.
Swappable data layer (`src/lib/db`) — in-memory now, Supabase adapter +
full-schema migration (RLS mirroring `src/lib/auth/rbac.ts`) in
`supabase/migrations/`. AI via the Anthropic Claude API (`src/lib/ai`), with a
deterministic template fallback. Every mutation is audited; the creative
usage-rights gate (`src/lib/assets.ts`) and automation engine
(`src/lib/automation.ts`) enforce their rules server-side.
