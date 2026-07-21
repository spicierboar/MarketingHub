<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Marketing Command Centre — project notes

- **Read `HANDOVER.md` first** for what's built, how to run, and the roadmap.
- **Never call the store directly.** All data access goes through `src/lib/db/index.ts` (repository functions). The in-memory store backs it in dev/demo; the Supabase adapter (`src/lib/db/supabase-adapter.ts`, schema in `supabase/migrations/`) is the production backend.
- **The repo layer is ASYNC.** Every function from `@/lib/db`, `@/lib/audit`, `@/lib/scope`, plus `canAccessCompany`/`accessibleCompanyIds`, `checkCompliance`/`auditClaims`, `assertAiBudget`, the `@/lib/assets` gate, `buildReport`/`buildLocalDashboard`, `generateForCompany`, `duplicateWarning`, `detectGaps`, `retrieveSnippets` and `controlsBlockReason` returns a Promise — **always `await`**. Beware the two classes tsc can't catch: a bare boolean in a condition (`if (isUnderLegalHold(...))` — a Promise is always truthy) and a fire-and-forget guard (`assertAiBudget();` never throws into your action).
- **Every material action must `await logAction(...)`** (`src/lib/audit.ts`) — audit is append-only.
- **Scope every list** through `src/lib/scope.ts` and gate every action with `src/lib/auth/rbac.ts`. Users only ever see companies they're assigned to.
- **AI calls** go through `src/lib/ai/claude.ts`, which returns `null` (→ template fallback) when no key. Keep everything runnable with no external accounts.
- Core rule to preserve: AI drafts → user reviews → admin approves → export. Nothing unapproved is published.
- **Marketing content work:** use the Anthropic official skills under `.agents/skills/` and `.cursor/skills/` (`content-creation`, `draft-content`, `campaign-plan`, `brand-review`, `competitive-brief`, `seo-audit`, `email-sequence`, `performance-report`). See `.cursor/rules/marketing-content-skills.mdc`.
