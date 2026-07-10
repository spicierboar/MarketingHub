# M36 — Marketing automation workflows handoff (2026-07-10)

**Agent:** M36-W4-Automation · **Branch:** `w4/m36-automation`

`m36_handoff=yes`

## Shipped

- `/workflows` — admin UI for trigger library, agency templates, company workflows, settings, manual run, dispatch log
- `src/lib/marketing-automation.ts` + `src/lib/marketing-automation-connectors.ts` — WORKFLOW_TRIGGERS, template sequences, quiet hours, frequency cap, consent, `deployAgencyTemplate`, `runWorkflowForContact`
- `supabase/migrations/0032_marketing_automation.sql`
- Self-test `marketingAutomation.*` (+8) wired into `isolation.ts`
- Nav **Workflows** in `app-shell.tsx`

## Hard lock

`WORKFLOW_LIVE` — **not flipped**

## Verified

`npx tsc --noEmit` · `npx tsx scripts/run-fixtures.mjs`

## Fan-in

Ready for **M01-W4** after M34–M37 handoffs land.
